# Portable project backup: manifest versions + deduplicated objects, never sessions.
async def make_backup(store,p)
  versions=await store.history(p.id); versions.reverse()
  refs=Map.new()
  versions.each do |v|
    v.files.each {|f| refs.set(f.sha,f.size)}
  end
  total=0
  refs.each {|pair| total+=pair[1]}
  raise Error.new('Повна копія перевищує 128 МіБ або 1 999 об’єктів. Експортуйте потрібні версії окремо.') if total>125829120 || refs.size>=2000
  meta=JSON.stringify({format:'devvault-pocket/1',name:p.name,description:p.description,license:p.license,versions:versions.map { |v| {at:v.at,note:v.note,files:v.files} }})
  header=Blob.new([meta]);raise Error.new('Надмірний маніфест.') if header.size>4194304
  writer=ZipWriter.new(BlobWriter.new('application/zip'))
  await writer.add('vault.json',BlobReader.new(header),{level:0})
  refs.each do |pair|
    await writer.add('objects/'+pair[0],BlobReader.new(await store.object_blob(pair[0])),{level:0})
  end
  return await writer.close()
end

# Deserialization is deliberately data-only. Validate all blobs and manifests
# first; only then atomically restore into a new, private repository.
async def read_backup(store,file)
  meta=nil; chunks=Map.new()
  accept=async(lambda do |path,data|
    if path=='vault.json' && !meta && data.size<=4194304
      meta=JSON.parse(await data.text())
    elsif /^objects\/[0-9a-f]{64}$/.test(path)
      sha=path.slice(8)
      raise Error.new('Повторений або пошкоджений об’єкт.') if chunks.has(sha) || (await store.measure(data))!=sha
      chunks.set(sha,data)
    else
      raise Error.new('Неприпустимий запис резервної копії.')
    end
    return nil
  end)
  await store.unpack(file,accept)
  raise Error.new('Невідомий формат копії.') unless meta && meta.format=='devvault-pocket/1' && Array.isArray(meta.versions) && meta.versions.length>0 && meta.versions.length<=100
  normalize_name(meta.name)
  refs=Set.new()
  meta.versions.each do |v|
    raise Error.new('Пошкоджена версія.') unless Array.isArray(v.files) && Number.isSafeInteger(v.at) && v.at>0 && typeof(v.note)=='string' && v.note.length<=240
    v.files.each do |f|
      raise Error.new('Маніфест не відповідає файлам.') unless typeof(f.path)=='string' && chunks.has(f.sha) && chunks.get(f.sha).size==f.size
      refs.add(f.sha)
    end
    store.check_manifest(v.files)
  end
  raise Error.new('Зайві об’єкти у копії.') unless refs.size==chunks.size
  return {meta:meta,chunks:chunks}
end
