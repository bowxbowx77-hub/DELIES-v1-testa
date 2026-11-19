# Persistent local model. Android blobs live under Directory.Data; the WebView's
# transactional IndexedDB stores manifests (and, only in a browser, blob bodies).
# No selected document, path, token or password is sent to a server by this module.
def normalize_name(value)
  name = String(value).trim()
  raise Error.new('Назва: 1–64 латинські літери, цифри, крапка, дефіс або _.') unless /\A[a-z0-9][a-z0-9._-]{0,63}\z/i.test(name)
  return name
end

def byte_label(n)
  return "#{n} Б" if n < 1024
  return "#{(n/1024).toFixed(1)} КБ" if n < 1048576
  return "#{(n/1048576).toFixed(1)} МБ"
end

async def encoded_blob(blob)
  return await Promise.new do |resolve,reject|
    reader = FileReader.new()
    reader.onerror = -> { reject(Error.new('Не вдалося прочитати файл.')) }
    reader.onload = -> { resolve(reader.result.split(',')[1]) }
    reader.readAsDataURL(blob)
  end
end

async def write_chunks(blob, dir, path)
  offset = 0
  # appendFile is not atomic: write to a staging name before publishing a manifest.
  await Filesystem.writeFile({directory:dir,path:path,data:'',recursive:true})
  while offset < blob.size
    chunk = await encoded_blob(blob.slice(offset, offset+393216))
    await Filesystem.appendFile({directory:dir,path:path,data:chunk})
    offset += 393216
  end
  return (await Filesystem.getUri({directory:dir,path:path})).uri
end

class LocalVault
  async def open(policy)
    @policy = policy
    @native = Capacitor.isNativePlatform()
    raise Error.new('Android Filesystem недоступний.') if !@native && location.hostname=='pocket.devvault.invalid'
    @db = await openDB('devvault-pocket-v1',1,{upgrade: ->(db) {
      db.createObjectStore('projects',{keyPath:'id'})
      v = db.createObjectStore('versions',{keyPath:['repo','number']})
      v.createIndex('repo','repo')
      db.createObjectStore('objects',{keyPath:'sha'})
      db.createObjectStore('body')
      db.createObjectStore('prefs')
      db.createObjectStore('events',{autoIncrement:true})
    }})
    configure({useWebWorkers:false,chunkSize:65536})
    await collect()
    if @native
      previous=await Filesystem.readdir({directory:Directory.Cache,path:'exports'}).catch(->(e){nil})
      if previous
        previous.files.each do |f|
          await Filesystem.deleteFile({directory:Directory.Cache,path:'exports/'+f.name})
        end
      end
    end
  end

  async def pref(key)
    return await @db.get('prefs',key)
  end
  async def set_pref(key,value)
    await @db.put('prefs',value,key)
  end
  async def listing()
    return (await @db.getAll('projects')).sort(->(a,b){b.updated-a.updated})
  end
  async def project(id)
    p = await @db.get('projects',id)
    raise Error.new('Проєкт не знайдено.') unless p
    return p
  end
  async def version(id,num)
    v = await @db.get('versions',[id,Number(num)])
    raise Error.new('Версію не знайдено.') unless v
    return v
  end
  async def history(id)
    return (await @db.getAllFromIndex('versions','repo',id)).reverse()
  end
  async def events()
    return (await @db.getAll('events')).reverse()
  end
  async def size()
    total = 0
    (await @db.getAll('objects')).each do |o|
      total += o.size
    end
    return total
  end

  async def create(name,description,license)
    name=normalize_name(name)
    all=await listing()
    raise Error.new('Ліміт: 100 локальних сховищ, включно з кошиком.') if all.length>=100
    raise Error.new('Ця назва вже зайнята (перевірте кошик).') if all.some { |p| p.name.toLowerCase()==name.toLowerCase() }
    stamp=Date.now()
    p={id:crypto.randomUUID(),name:name,description:String(description).slice(0,420),license:license||'Unlicensed',created:stamp,updated:stamp,version:1,count:0,size:0,deleted:false}
    tx=@db.transaction(['projects','versions','events'],'readwrite')
    tx.objectStore('projects').add(p)
    tx.objectStore('versions').add({repo:p.id,number:1,at:stamp,note:'Створено сховище',files:[]})
    tx.objectStore('events').add({at:stamp,text:"Створено #{name}"})
    await tx.done
    return p
  end

  async def update(p, message)
    p.updated=Date.now()
    tx=@db.transaction(['projects','events'],'readwrite')
    tx.objectStore('projects').put(p)
    tx.objectStore('events').add({at:p.updated,text:message})
    await tx.done
  end

  async def object_blob(sha)
    raise Error.new('Невірна адреса вмісту.') unless /\A[0-9a-f]{64}\z/.test(sha)
    if @native
      uri=(await Filesystem.getUri({directory:Directory.Data,path:"objects/#{sha}"})).uri
      res=await fetch(Capacitor.convertFileSrc(uri))
      raise Error.new('Локальний файл недоступний.') unless res.ok
      return await res.blob()
    end
    result=await @db.get('body',sha)
    raise Error.new('Вміст відсутній у базі.') unless result
    return result
  end

  async def measure(blob)
    raise Error.new('Максимальний розмір файлу — 32 МіБ.') if blob.size>33554432
    bytes=Uint8Array.new(await blob.arrayBuffer())
    @policy.content(bytes)
    hash=Uint8Array.new(await crypto.subtle.digest('SHA-256',bytes))
    return Array.from(hash).map { |x| x.toString(16).padStart(2,'0') }.join('')
  end

  async def unpack(blob,accept)
    raise Error.new('Ліміт пакета — 128 МіБ.') if blob.size>134217728
    tail=Uint8Array.new(await blob.slice(Math.max(0,blob.size-65557)).arrayBuffer())
    @policy.check_bytes(tail,'dv_zip_tail',blob.size)
    reader=ZipReader.new(BlobReader.new(blob))
    begin
      entries=await reader.getEntries()
      total=0
      raise Error.new('Забагато записів ZIP.') if entries.length>2000
      entries.each do |e|
        @policy.entry(e)
        path=@policy.path(e.filename.replace(/\/$/,''))
        next if e.directory
        total+=e.uncompressedSize
        raise Error.new('Розпакований проєкт перевищує 128 МіБ.') if total>134217728
        chunks=[]
        written=0
        sink=WritableStream.new({write: ->(chunk){
          written+=chunk.byteLength
          raise Error.new('Неприпустимий розмір запису ZIP.') if written>e.uncompressedSize || written>33554432
          chunks.push(chunk)
        }})
        await e.getData(sink,{checkSignature:true})
        raise Error.new('Неповний файл у ZIP.') unless written==e.uncompressedSize
        await accept(path,Blob.new(chunks))
      end
    ensure
      await reader.close()
    end
  end

  def check_manifest(files)
    raise Error.new('Ліміт знімка: 2 000 файлів.') if files.length>2000
    sum=0
    names=Set.new()
    files.each do |f|
      key=@policy.path(f.path).toLowerCase()
      raise Error.new('Конфлікт імен файлів.') if names.has(key)
      names.add(key)
      sum+=f.size
    end
    raise Error.new('Ліміт знімка: 128 МіБ.') if sum>134217728
    names.each do |key|
      parts=key.split('/')
      parts.pop()
      while parts.length>0
        raise Error.new('Файл і каталог мають однаковий шлях.') if names.has(parts.join('/'))
        parts.pop()
      end
    end
    return sum
  end

  async def save(p,files,note,staged)
    current=await project(p.id)
    raise Error.new('Сховище змінилося. Відкрийте поточну версію.') if current.deleted || current.version!=p.version
    raise Error.new('Ліміт локальної історії: 100 версій.') if p.version>=100
    sum=check_manifest(files)
    used=await size()
    fresh=[]
    staged.each do |pair|
      sha=pair[0]; blob=pair[1]
      next if await @db.get('objects',sha)
      used+=blob.size
      raise Error.new('Недостатньо місця у квоті DEVVAULT (1 ГіБ).') if used>1073741824
      fresh.push({sha:sha,blob:blob})
    end
    fresh.each do |item|
      if @native
        temp="stage/#{crypto.randomUUID()}"
        await write_chunks(item.blob,Directory.Data,temp)
        await Filesystem.rename({from:temp,to:"objects/#{item.sha}",directory:Directory.Data})
      end
    end
    p.version+=1; p.size=sum; p.count=files.length; p.updated=Date.now()
    v={repo:p.id,number:p.version,note:String(note).slice(0,240),at:p.updated,files:files}
    tx=@db.transaction(['projects','versions','objects','body','events'],'readwrite')
    fresh.each do |item|
      tx.objectStore('objects').put({sha:item.sha,size:item.blob.size})
      tx.objectStore('body').put(item.blob,item.sha) unless @native
    end
    tx.objectStore('versions').add(v);tx.objectStore('projects').put(p)
    tx.objectStore('events').add({at:p.updated,text:"#{p.name} · v#{p.version}: #{v.note}"})
    await tx.done
    return p
  end

  async def ingest(p,selected,note)
    raise Error.new('Забагато вибраних файлів.') if selected.length>2000
    bytes=0;selected.each {|item| bytes+=item.size}
    raise Error.new('Виберіть до 128 МіБ за раз.') if bytes>134217728
    old=await version(p.id,p.version)
    incoming=Set.new(); staged=Map.new(); paths=Map.new(); total=0
    old.files.each do |f|
      paths.set(f.path,f)
    end
    accept=async(lambda do |raw,blob|
      path=@policy.path(raw)
      raise Error.new('Повторений шлях або забагато файлів.') if incoming.has(path) || incoming.size>=2000
      total+=blob.size
      raise Error.new('Виберіть до 128 МіБ за раз.') if total>134217728
      sha=await measure(blob)
      paths.set(path,{path:path,size:blob.size,sha:sha}); staged.set(sha,blob);incoming.add(path)
    end)
    selected.each do |f|
      path=@policy.path(f.webkitRelativePath || f.name,true)
      if path.toLowerCase().endsWith('.zip')
        await unpack(f,accept)
      else
        await accept(path,f)
      end
    end
    raise Error.new('Немає файлів для імпорту.') if incoming.size==0
    return await save(p,Array.from(paths).map {|pair| pair[1]},note || "Імпорт: #{incoming.size} файлів",staged)
  end

  async def archive(id,n)
    v=await version(id,n)
    out=ZipWriter.new(BlobWriter.new('application/zip'))
    v.files.each do |f|
      blob=await object_blob(f.sha)
      await out.add(f.path,BlobReader.new(blob),{level:0})
    end
    return await out.close()
  end

  async def restore_backup(file,name)
    name=normalize_name(name)
    all=await listing()
    raise Error.new('Нова назва має бути вільна. Ліміт — 100 сховищ.') if all.length>=100 || all.some { |p| p.name.toLowerCase()==name.toLowerCase() }
    restored=await read_backup(self,file); meta=restored.meta; staged=restored.chunks
    fresh=[]; used=await size()
    staged.each do |pair|
      next if await @db.get('objects',pair[0])
      used+=pair[1].size;fresh.push(pair)
    end
    raise Error.new('Перевищено квоту 1 ГіБ.') if used>1073741824
    if @native
      fresh.each do |pair|
        tmp="stage/#{crypto.randomUUID()}";await write_chunks(pair[1],Directory.Data,tmp)
        await Filesystem.rename({from:tmp,to:"objects/#{pair[0]}",directory:Directory.Data})
      end
    end
    id=crypto.randomUUID(); latest=meta.versions[meta.versions.length-1];stamp=Date.now()
    if ['MIT','Apache-2.0','BSD-3-Clause','GPL-3.0-only','Unlicensed'].includes(meta.license)
      license=meta.license
    else
      license='Unlicensed'
    end
    p={id:id,name:name,description:String(meta.description||'').slice(0,420),license:license,version:meta.versions.length,updated:stamp,created:stamp,deleted:false,count:latest.files.length,size:check_manifest(latest.files)}
    tx=@db.transaction(['objects','body','versions','projects','events'],'readwrite')
    fresh.each do |pair|
      tx.objectStore('objects').put({sha:pair[0],size:pair[1].size})
      tx.objectStore('body').put(pair[1],pair[0]) unless @native
    end
    i=0
    meta.versions.each do |v|
      i+=1;tx.objectStore('versions').add({repo:id,number:i,note:v.note,files:v.files,at:v.at})
    end
    tx.objectStore('projects').add(p);tx.objectStore('events').add({at:stamp,text:"Відновлено #{name} із копії"});await tx.done
    return p
  end

  async def erase(p,confirm_name)
    raise Error.new('Спершу перемістіть проєкт до кошика і підтвердьте назву.') unless p.deleted && p.name==confirm_name
    all=await history(p.id)
    tx=@db.transaction(['versions','projects','events'],'readwrite')
    all.each do |v|
      tx.objectStore('versions').delete([p.id,v.number])
    end
    tx.objectStore('projects').delete(p.id)
    tx.objectStore('events').add({at:Date.now(),text:'Сховище остаточно видалено'})
    await tx.done
    await collect()
  end

  async def collect()
    live=Set.new()
    cursor=await @db.transaction('versions').store.openCursor()
    while cursor
      cursor.value.files.each do |f|
        live.add(f.sha)
      end
      cursor=await cursor.continue()
    end
    if @native
      ['stage','objects'].each do |folder|
        listing=await Filesystem.readdir({directory:Directory.Data,path:folder}).catch(->(e){nil})
        unless listing
          await Filesystem.mkdir({directory:Directory.Data,path:folder,recursive:true})
          next
        end
        listing.files.each do |file|
          if folder=='stage' || !live.has(file.name)
            await Filesystem.deleteFile({directory:Directory.Data,path:"#{folder}/#{file.name}"})
          end
        end
      end
    end
    (await @db.getAllKeys('objects')).each do |sha|
      next if live.has(sha)
      tx=@db.transaction(['objects','body'],'readwrite');tx.objectStore('objects').delete(sha);tx.objectStore('body').delete(sha);await tx.done
    end
  end
end
