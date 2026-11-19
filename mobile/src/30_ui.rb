# Static templates contain no inline event handlers. Every user/server string is
# escaped before inserting it into markup; previews use escaped plain text only.
def esc(value)
  return String(value || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')
end

def glyph(name)
  shapes={vault:'M3 7l9-5 9 5-9 5z M3 12l9 5 9-5 M3 17l9 5 9-5',cloud:'M7 18a5 5 0 0 1-1-10 7 7 0 0 1 13 2 4 4 0 0 1 0 8z',log:'M3 12h4l3-8 4 16 3-8h4',user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2',folder:'M3 7V4h7l2 3h9v13H3z',plus:'M12 5v14 M5 12h14',upload:'M12 16V3 M7 8l5-5 5 5 M4 15v5h16v-5',download:'M12 3v13 M7 11l5 5 5-5 M4 17v4h16v-4',back:'M19 12H5 M11 6l-6 6 6 6',arrow:'M8 5l7 7-7 7',box:'M3 7l9-5 9 5-9 5z M3 7v10l9 5 9-5V7 M12 12v10',trash:'M3 6h18 M8 6V3h8v3 M6 6l1 15h10l1-15',history:'M3 5v5h5 M4 10a8 8 0 1 1 0 6 M12 7v6l4 2',edit:'M3 17l12-12 4 4L7 21H3z M14 6l4 4',file:'M5 2h9l5 5v15H5z M14 2v6h5',search:'M16 10a6 6 0 1 1-12 0 6 6 0 1 1 12 0 M14 15l7 7',lock:'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',share:'M9 15L21 3 M12 3h9v9 M8 6H3v15h15v-5',check:'M3 13l6 6L21 6',drive:'M4 6h16l2 12H2z M5 15h2 M17 15h2'}
  shape=shapes[name]||shapes.box
  return "<svg aria-hidden='true' viewBox='0 0 24 24' width='18' height='18' fill='none' stroke='currentColor' stroke-width='1.65' stroke-linecap='round' stroke-linejoin='round'><path d='#{shape}'/></svg>"
end

def btn(action,label,icon='',kind='',value='')
  return "<button type='button' data-act='#{esc(action)}' data-val='#{esc(value)}' class='btn #{esc(kind)}'>#{icon ? glyph(icon) : ''}#{esc(label)}</button>"
end

def field(label,name,value='',type='text',required=true,max=240)
  return "<label>#{esc(label)}<input type='#{type}' name='#{name}' value='#{esc(value)}' maxlength='#{max}' #{required ? 'required' : ''} autocomplete='#{type=='password' ? 'current-password' : 'off'}'></label>"
end

def title(kicker,text,sub='')
  return "<div class='eyebrow'><i></i>#{esc(kicker)}</div><h1>#{esc(text)}</h1><p class='sub'>#{esc(sub)}</p>"
end

def empty_box(icon,text,desc)
  return "<div class='empty'><span class='bigglyph'>#{glyph(icon)}</span><h3>#{esc(text)}</h3><p>#{esc(desc)}</p></div>"
end

def small_date(n)
  return Date.new(n).toLocaleString('uk-UA',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
end

def form_box(action,body,submit,ending='')
  return "<form data-form='#{action}' class='panel form'>#{body}<div class='bar'><button type='submit' class='btn solid'>#{esc(submit)}</button>#{ending}</div></form>"
end

def artwork()
  return '<svg class="art" aria-hidden="true" viewBox="0 0 190 142"><defs><pattern id="mesh" width="9" height="9" patternTransform="matrix(1 .48 -1 .48 0 0)" patternUnits="userSpaceOnUse"><path d="M0 0H9V9" fill="none" stroke="#83b478" stroke-width=".7"/></pattern></defs><g transform="translate(0,48)"><path d="M15 42l78-36 79 36-79 37z" fill="#263e29" stroke="#9cda79"/><path d="M15 42v8l78 37v-8m0 8 79-37v-8" fill="#233b28" stroke="#82ba6b"/></g><g transform="translate(0,24)"><path d="M15 42l78-36 79 36-79 37z" fill="#2e4930" stroke="#a2dc83"/><path d="M15 42v8l78 37v-8m0 8 79-37v-8" fill="#253e2b" stroke="#9ad97c"/></g><path d="M15 42l78-36 79 36-79 37z" fill="#355434" stroke="#b2f18d"/><path d="M15 42l78-36 79 36-79 37z" fill="url(#mesh)"/><path d="M15 42v8l78 37v-8m0 8 79-37v-8" fill="#2b472d" stroke="#a6e886"/><path d="M64 42l29-13 29 13-29 14z" fill="#385b37" stroke="#b2f18d"/><path d="m83 44 11-10m-4 13 11-10" stroke="#b5ea91" stroke-width="3"/></svg>'
end

class Pocket
  async def boot()
    @host=document.getElementById('app');@tabs=document.getElementById('tabs');@toast=document.getElementById('notice');@busy=false;@loaded=false
    @store=LocalVault.new();@policy=VaultPolicy.new();await @policy.open()
    await navigator.locks.request('devvault-local-write',async(lambda { await @store.open(@policy) }))
    saved=await @store.pref('origin');@server=VaultServer.new();@server.load_origin(saved||'');@query='';@scope='public';@cloud=[];@detail=nil
    document.addEventListener('click') do |e|
      node=e.target.closest('button[data-act]'); handle(node.dataset.act,node.dataset.val) if node
    end
    document.addEventListener('submit') do |e|
      e.preventDefault();frm=e.target;handle('submit',frm.dataset.form,frm) if frm.dataset.form
    end
    document.addEventListener('input') do |e|
      if e.target.id=='filter'
        needle=e.target.value.toLowerCase();document.querySelectorAll('.search-row').forEach { |row| row.hidden=!row.dataset.key.includes(needle) }
      end
    end
    window.addEventListener('popstate'){ reload() unless @busy }
    @loaded=true;await render()
  end
  def flash(text,bad=false)
    @toast.textContent=String(text);@toast.className=bad ? 'shown error' : 'shown'
    clearTimeout(@timer);@timer=setTimeout(-> { @toast.className='' },5000)
  end
  def go(page,id='',v='')
    dest=khash(page,id,v)
    window.history.pushState(nil,'',dest) unless location.hash==dest
    window.scrollTo(0,0)
  end
  def khash(page,id,v)
    return '#'+[page,id,v].map {|n| encodeURIComponent(String(n))}.join('/')
  end
  async def reload()
    begin
      await render()
    rescue => ex
      flash(ex.message,true);go('home');await render()
    end
  end
  def back(page='home',id='')
    return btn('nav:'+page,'Назад','back','quiet',id)
  end
  async def render()
    parts=location.hash.slice(1).split('/').map {|n| decodeURIComponent(n)}
    @page=parts[0]||'home'; @id=parts[1]||''; @num=Number(parts[2]||0)
    repos=await @store.listing(); live=repos.filter {|p| !p.deleted}; trash=repos.filter {|p| p.deleted}
    tab=(['server','auth','cloud','remote','publish'].includes(@page) ? 'server' : @page=='events' ? 'events' : @page=='profile' ? 'profile' : 'home')
    @tabs.innerHTML=[['home','Сховище','vault'],['server','Сервер','cloud'],['events','Журнал','log'],['profile','Профіль','user']].map {|t| btn('nav:'+t[0],t[1],t[2],tab==t[0] ? 'tab active' : 'tab')}.join('')
    if @page=='home' || @page=='list'
      used=await @store.size()
      if @page=='home'
        page="<section class='hero'><div><div class='chip'><i></i> LOCAL WORKSPACE</div><h1>Моє сховище<span>.</span></h1><p>Ваші проєкти та версії на пристрої.</p>#{btn('nav:new','Новий проєкт','plus','solid')}</div>#{artwork()}</section>"
        nversions=0;live.each {|r| nversions+=r.version}
        page+="<div class='metrics'><div>#{glyph('folder')} Проєкти<b>#{live.length}</b></div><div>#{glyph('history')} Версії<b>#{nversions}</b></div><div>#{glyph('drive')} Дані<b>#{byte_label(used)}</b></div></div>"
      else
        page=back()+title('LIBRARY','Мої проєкти')+btn('nav:new','Новий проєкт','plus','solid')
      end
      page+="<div class='section'><h2>Мої проєкти</h2><span class='counter'>#{live.length}</span></div>"
      page+='<label class="finder">Пошук <input id="filter" placeholder="Назва або опис…"></label>' if live.length>0
      page+=live.map {|p| row(p)}.join('')
      page+=empty_box('folder','Тут будуть ваші проєкти','Створіть сховище та додайте ZIP або окремі файли. Інтернет не потрібен.') if live.length==0
      page+="<div class='bar'>#{btn('nav:backup-in','Відновити копію','history','quiet')}#{btn('nav:trash',"Кошик · #{trash.length}",'trash','quiet')}</div>"
    elsif @page=='new' || @page=='edit'
      is_new=@page=='new';p={name:'',description:'',license:'MIT'}
      p=await @store.project(@id) unless is_new
      page=back(is_new ? 'home' : 'project',@id)+title('REPOSITORY',is_new ? 'Новий проєкт' : 'Параметри','Файли зберігаються локально. Публікація — окрема дія.')
      options=['MIT','Apache-2.0','BSD-3-Clause','GPL-3.0-only','Unlicensed'].map {|s| "<option #{s==p.license ? 'selected' : ''}>#{s}</option>"}.join('')
      page+=form_box(@page,field('Назва','name',p.name,'text',true,64)+field('Опис','description',p.description,'text',false,420)+"<label>Ліцензія<select name='license'>#{options}</select></label>",'Зберегти')
    elsif @page=='project' || @page=='history' || @page=='add' || @page=='file'
      p=await @store.project(@id);raise Error.new('Проєкт у кошику.') if p.deleted
      n=@num||p.version;v=await @store.version(p.id,n);@selected=v
      page=back('home')+title('DEVICE / REPOSITORY',p.name,p.description)+"<div class='meta'>#{glyph('lock')} Локальний · #{esc(p.license)} · v#{p.version}</div>"
      if @page=='add'
        page+=form_box('add',"<h2>Імпорт файлів</h2><label>Файли або ZIP<input name='files' type='file' multiple></label><label>Каталог (якщо підтримує вибір файлів)<input name='folder' type='file' webkitdirectory multiple></label>"+field('Опис змін','note','','text',false)+"<p>До 32 МіБ на файл, 128 МіБ та 2 000 файлів на знімок. Наявні шляхи оновляться.</p>",'Зберегти версію',btn('nav:project','Скасувати','','quiet',p.id))
        page+=form_box('write-new',"<h2>Новий текстовий файл</h2>"+field('Шлях','path','README.md','text',true,512)+"<label>Текст<textarea name='content' rows='6' maxlength='98304'></textarea></label>",'Створити файл')
      elsif @page=='history'
        history=await @store.history(p.id);page+="<div class='section'><h2>Історія версій</h2></div>"
        history.each do |rev|
          page+="<article class='panel'><b>v#{rev.number}</b> · #{esc(rev.note)}<p>#{esc(small_date(rev.at))} · #{rev.files.length} файлів</p><div class='bar'>#{btn('version','Переглянути','folder','',rev.number)}#{rev.number!=p.version ? btn('restore-v','Відновити','history','',rev.number) : ''}</div></article>"
        end
      elsif @page=='file'
        file=v.files[@file_index||0];raise Error.new('Немає файлу.') unless file
        content=await @store.object_blob(file.sha);slice=await content.slice(0,98304).arrayBuffer();text=''
        begin
          text=TextDecoder.new('utf-8',{fatal:true}).decode(slice)
          text='Двійковий файл — доступний у ZIP.' if text.includes("\u0000")
        rescue => _err
          text='Двійковий файл — доступний у ZIP.'
        end
        page+="<article class='panel'><h2>#{esc(file.path)}</h2><p>#{byte_label(file.size)} · v#{n}</p><pre>#{esc(text)}</pre>#{file.size>98304 ? '<p>Показано перші 96 КіБ.</p>' : ''}</article>"+btn('version','До файлів','back','',n)
        if n==p.version
          if file.size<=98304 && text!='Двійковий файл — доступний у ZIP.'
            page+=form_box('write-text',"<label>Редагувати текст<textarea name='content' rows='5' maxlength='98304'>#{esc(text)}</textarea></label>",'Зберегти текст')
          end
          page+=form_box('rename-file',field('Шлях файлу','path',file.path,'text',true,512),'Перейменувати',btn('remove-file','Видалити','trash','danger'))
        end
      else
        page+="<div class='bar'>#{btn('nav:add','Додати файли','upload','solid',p.id)}#{btn('export','ZIP','download','',n)}#{btn('nav:history','Версії','history','',p.id)}</div>"
        page+="<div class='section'><h2>Файли</h2><span class='counter'>v#{n} / #{v.files.length}</span></div><div class='panel files'>"
        v.files.forEach do |f,i|
          page+="<button data-act='file' data-val='#{i}'>#{glyph('file')}<span>#{esc(f.path)}</span><small>#{byte_label(f.size)}</small>#{glyph('arrow')}</button>"
        end
        page+=empty_box('box','Порожній знімок','Додайте файли, щоб створити наступну версію.') if v.files.length==0
        page+="</div><div class='section'><h2>Керування</h2></div><div class='bar'>#{btn('nav:publish','На сервер','cloud','',p.id)}#{btn('nav:edit','Параметри','edit','',p.id)}#{btn('backup-out','Резервна копія','download','',p.id)}#{btn('trash','У кошик','trash','quiet',p.id)}</div>"
        if p.remote
          page+="<p class='sub'>Серверна копія v#{Number(p.remote.version)} · #{esc(p.remote.origin)} · #{esc(p.remote.visibility)}</p>"
        end
      end
    elsif @page=='trash'
      page=back()+title('RECOVERY','Кошик','Відновлення поверне файли й усю локальну історію.')
      trash.each {|p| page+="<article class='panel'><b>#{esc(p.name)}</b><div class='bar'>#{btn('untrash','Відновити','history','',p.id)}#{btn('nav:purge','Видалити назавжди','trash','danger',p.id)}</div></article>"}
      page+=empty_box('trash','Кошик порожній','Видалені проєкти можна відновити тут.') if trash.length==0
    elsif @page=='purge'
      p=await @store.project(@id);page=back('trash')+title('CONFIRM DELETE','Остаточне видалення',p.name)+form_box('purge',field('Введіть точну назву проєкту','name'),'Видалити всі версії')
    elsif @page=='backup-in'
      page=back()+title('RECOVERY','Відновити копію','Перевіримо контрольні суми й створимо нове локальне сховище. Існуючі проєкти не зміняться.')+form_box('backup-in',field('Нова назва','name')+"<label>Копія DEVVAULT (.dvault)<input type='file' name='backup' required></label>",'Відновити')
    elsif @page=='events'
      logs=await @store.events(); read_at=(await @store.pref('read_at'))||0
      page=title('LOCAL EVENTS','Журнал подій','Лише фактичні дії у цьому сховищі.')+btn('read','Позначити прочитаними','check')
      logs.slice(0,100).each {|e| page+="<div class='event'><i class='#{e.at>read_at ? 'fresh' : ''}'></i><div>#{esc(e.text)}<small>#{esc(small_date(e.at))}</small></div></div>"}
      page+=empty_box('log','Подій ще немає','Після створення першого проєкту тут з’явиться запис.') if logs.length==0
    elsif @page=='profile'
      author=(await @store.pref('author'))||'Developer';page=title('IDENTITY','Профіль пристрою','Локальний профіль не є серверним обліковим записом.')+form_box('profile',field('Ім’я на пристрої','name',author,'text',true,40),'Зберегти')+"<div class='panel'><h2>Резервування</h2><p>Зберігайте .dvault через «Резервна копія» на сторінці проєкту. Видалення застосунку стирає приватні дані на телефоні.</p>#{btn('nav:backup-in','Відновити копію','history')}</div>"+btn('nav:server','Акаунт сервера','cloud')
    else
      page=await server_page()
    end
    @host.innerHTML=page
  end
  def row(p)
    return "<button class='repo search-row' data-act='nav:project' data-val='#{esc(p.id)}' data-key='#{esc((p.name+' '+p.description).toLowerCase())}'><span class='tile'>#{glyph('box')}</span><span><b>#{esc(p.name)}</b><small>#{esc(p.description || 'Локальне сховище')}</small><em>v#{p.version} · #{p.count} файлів · #{byte_label(p.size)}</em></span>#{glyph('arrow')}</button>"
  end
  async def server_page()
    if @page=='server'
      page=title('REMOTE / HTTPS','Сервер','Підключайте лише сервер DEVVAULT, якому довіряєте. На пристрої можна працювати без з’єднання.')
      page+=form_box('connect',field('HTTPS-адреса','origin',@server.origin,'url',true,250),'Перевірити та підключити')
      if @server.origin
        page+="<article class='panel'><div class='eyebrow'>#{esc(@server.origin)}</div><h2>#{@server.user ? esc(@server.user.name) : 'Серверний простір'}</h2><div class='bar'>"
        page+=@server.user ? btn('cloud-mine','Мої проєкти','folder','solid')+btn('logout','Вийти','','quiet') : btn('login','Увійти','lock','solid')+btn('register','Реєстрація','user')
        page+=btn('cloud-public','Публічні','cloud')+btn('web','Вебпростір','share')+'</div></article>'
      end
      return page
    elsif @page=='auth'
      reg=@id=='register';page=back('server')+title('ACCOUNT',reg ? 'Реєстрація' : 'Вхід',@server.origin)
      inputs=reg ? field('Ім’я','name','','text',true,40) : ''
      return page+form_box(reg ? 'register' : 'login',inputs+field('Email','email','','email',true,254)+field('Пароль','password','','password',true,128),reg ? 'Створити акаунт' : 'Увійти')+'<p class="sub">Пароль не зберігається. Сесія діє до 12 годин або до закриття застосунку.</p>'
    elsif @page=='cloud'
      page=back('server')+title('SERVER LIBRARY',@scope=='public' ? 'Публічні репозиторії' : 'Мої серверні проєкти',@server.origin)
      page+=form_box('cloud-search',field('Пошук','query',@query,'search',false,100),'Знайти')
      @cloud.each {|p| page+="<button class='repo' data-act='remote' data-val='#{esc(p.id)}'><span class='tile'>#{glyph('cloud')}</span><span><b>#{esc(p.name)}</b><small>#{esc(p.description)}</small><em>#{esc(p.author)} · #{esc(p.visibility)} · #{Number(p.files)} файлів</em></span>#{glyph('arrow')}</button>"}
      page+=btn('more','Ще репозиторії','plus') if @more
      page+=empty_box('search','Нічого не знайдено','Змініть запит або опублікуйте проєкт.') if @cloud.length==0
      return page
    elsif @page=='remote-preview' && @remote_file
      return btn('remote-version','До проєкту','back','quiet',@num)+title('READ ONLY',@remote_file.name)+"<pre>#{esc(@remote_file.text)}</pre>"
    elsif @page=='remote'
      @server.public_link(@id)
      d=await @server.api('/repos/'+@id+'?version='+(@num||''));r=d.repo;@detail=d
      page=back('cloud')+title('SERVER / '+r.visibility,r.name,r.description)+"<div class='panel'><div class='info'><span>Автор</span><b>#{esc(r.author)}</b><span>Створено</span><b>#{esc(small_date(r.created))}</b><span>Ліцензія</span><b>#{esc(r.license)}</b><span>Перегляди / ZIP</span><b>#{Number(r.views)} / #{Number(r.downloads)}</b></div></div>"
      page+="<div class='bar'>#{btn('pull','Зберегти на пристрої','download','solid')}#{r.visibility=='public' ? btn('share-link','Посилання','share') : ''}#{d.owner ? btn('remote-web','Керування','edit') : ''}</div>"
      page+="<div class='section'><h2>Файли · v#{Number(d.selected)}</h2></div><div class='panel files'>"
      d.files.forEach {|f,i| page+="<button data-act='remote-file' data-val='#{i}'>#{glyph('file')}<span>#{esc(f.path)}</span><small>#{byte_label(f.size)}</small></button>"}
      page+="</div><div class='section'><h2>Версії</h2></div>"
      d.versions.each {|v| page+="<div class='panel'><b>v#{Number(v.number)}</b> · #{esc(v.message)}<p>#{esc(small_date(v.created))}</p>#{btn('remote-version','Переглянути','folder','',v.number)}</div>"};return page
    elsif @page=='publish'
      p=await @store.project(@id);page=back('project',p.id)+title('PUBLISH','Копія на сервері',p.name+' · v'+String(p.version))
      unless @server.user
        return page+empty_box('lock','Потрібен серверний акаунт','Локальні проєкти не публікуються автоматично. Підключіть HTTPS-сервер і увійдіть.')+btn('nav:server','Підключити сервер','cloud','solid')
      end
      linked=@server.linked(p);location_label=linked ? 'Оновлення прив’язаної серверної копії за тим самим посиланням.' : 'Створення нового серверного репозиторію.'
      naming=linked ? '' : field('Назва нового репозиторію','name',p.name,'text',true,64)
      return page+form_box('publish',"<p>#{esc(@server.origin)} · #{location_label} Передаємо лише поточний знімок. Публічний режим відкриває всю історію серверної копії.</p>"+naming+"<label>Видимість<select name='visibility'><option value='private'>Приватний — тільки я</option><option value='public'>Публічний — усі за посиланням</option></select></label>",'Передати знімок')
    end
    return back()+empty_box('folder','Сторінку не знайдено','Поверніться до сховища.')
  end

  async def refresh_cloud(more=false)
    if @scope=='public'
      off=more ? @cloud.length : 0
      r=await @server.api('/public?q='+encodeURIComponent(@query)+'&offset='+String(off))
      @cloud=more ? @cloud.concat(r.repos) : r.repos;@more=r.more
    else
      r=await @server.api('/workspace');@cloud=r.repos.filter {|p| (p.name+' '+p.description).toLowerCase().includes(@query.toLowerCase())};@more=false
    end
  end

  async def share_blob(blob,name)
    if Capacitor.isNativePlatform()
      uri=await write_chunks(blob,Directory.Cache,"exports/#{name}")
      await Share.share({title:name,files:[uri],dialogTitle:'Зберегти або передати файл'})
    else
      url=URL.createObjectURL(blob); a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(-> {URL.revokeObjectURL(url)},60000)
    end
  end
  async def open_site(url)
    if Capacitor.isNativePlatform()
      await Browser.open({url:url})
    else
      window.open(url,'_blank','noopener,noreferrer')
    end
  end
  async def handle(action,val='',frm=nil)
    return if @busy
    @busy=true; document.body.classList.add('busy');@host.setAttribute('aria-busy','true')
    begin
      await navigator.locks.request('devvault-local-write',async(lambda { await perform(action,val||'',frm) }))
      await render()
    rescue => ex
      flash(ex.message || 'Не вдалося завершити операцію.',true)
    ensure
      @busy=false;document.body.classList.remove('busy');@host.removeAttribute('aria-busy')
    end
  end
  async def perform(action,val,frm)
    if action.startsWith('nav:')
      go(action.slice(4),val);return
    end
    if action=='submit'
      fd=FormData.new(frm)
      if val=='new'
        p=await @store.create(fd.get('name'),fd.get('description'),fd.get('license'));go('project',p.id);flash('Локальний проєкт створено.')
      elsif val=='edit'
        p=await @store.project(@id);name=normalize_name(fd.get('name'));all=await @store.listing()
        raise Error.new('Назва вже зайнята.') if all.some {|r| r.id!=p.id && r.name.toLowerCase()==name.toLowerCase()}
        p.name=name;p.description=String(fd.get('description')).slice(0,420);p.license=fd.get('license');await @store.update(p,"Оновлено параметри #{name}");go('project',p.id)
      elsif val=='add'
        selected=Array.from(frm.elements.namedItem('files').files).concat(Array.from(frm.elements.namedItem('folder').files))
        raise Error.new('Спершу виберіть файли.') if selected.length==0
        flash('Перевірка файлів і збереження…');p=await @store.project(@id);await @store.ingest(p,selected,fd.get('note'));go('project',p.id);flash('Нову версію збережено на пристрої.')
      elsif val=='write-new' || val=='write-text'
        p=await @store.project(@id);v=await @store.version(p.id,p.version)
        if val=='write-new'
          path=@policy.path(fd.get('path'));raise Error.new('Цей шлях існує. Відкрийте файл для редагування.') if v.files.some {|f| f.path.toLowerCase()==path.toLowerCase()}
        else
          raise Error.new('Версія змінилася.') unless v.number==@selected.number
          path=v.files[@file_index||0].path
        end
        blob=Blob.new([String(fd.get('content'))]);raise Error.new('Редактор підтримує до 96 КіБ.') if blob.size>98304
        sha=await @store.measure(blob);updated=v.files.filter {|f| f.path!=path};updated.push({path:path,sha:sha,size:blob.size});staged=Map.new();staged.set(sha,blob)
        await @store.save(p,updated,"Збережено #{path}",staged);go('project',p.id)
      elsif val=='rename-file'
        p=await @store.project(@id);v=await @store.version(p.id,p.version);raise Error.new('Редагується лише поточна версія.') unless v.number==@selected.number
        dest=@policy.path(fd.get('path'));f=v.files[@file_index||0];old=f.path;f.path=dest;await @store.save(p,v.files,"#{old} → #{dest}",Map.new());go('project',p.id)
      elsif val=='profile'
        name=String(fd.get('name')).trim();raise Error.new('Порожнє ім’я.') unless name
        await @store.set_pref('author',name);flash('Профіль збережено.')
      elsif val=='purge'
        p=await @store.project(@id);await @store.erase(p,fd.get('name'));go('trash');flash('Локальний проєкт остаточно видалено.')
      elsif val=='backup-in'
        file=frm.elements.namedItem('backup').files[0];p=await @store.restore_backup(file,fd.get('name'));go('project',p.id);flash('Історію та вміст відновлено.')
      elsif val=='connect'
        await @server.configure_origin(fd.get('origin'));await @store.set_pref('origin',@server.origin);@cloud=[];@detail=nil;flash('Сервер DEVVAULT відповідає.')
      elsif val=='register' || val=='login'
        await @server.auth(val,{email:fd.get('email'),name:fd.get('name'),password:fd.get('password')});frm.reset();go('server');flash('Серверну сесію відкрито.')
      elsif val=='cloud-search'
        @query=String(fd.get('query')||'');await refresh_cloud()
      elsif val=='publish'
        p=await @store.project(@id);flash('Передавання на вибраний сервер…');published=await @server.publish(@store,p,fd.get('name'),fd.get('visibility'));go('remote',published.id);flash('Сервер підтвердив збереження знімка.')
      end
      return
    end
    case action
    when 'file'
      @file_index=Number(val);go('file',@id,@selected.number)
    when 'version'
      go('project',@id,Number(val))
    when 'restore-v'
      return unless window.confirm('Відновити цей знімок як нову версію?')
      p=await @store.project(@id);v=await @store.version(@id,val);await @store.save(p,v.files,"Відновлено v#{v.number}",Map.new());go('history',p.id)
    when 'remove-file'
      return unless window.confirm('Прибрати файл із поточної версії? Історія збережеться.')
      p=await @store.project(@id);v=await @store.version(p.id,p.version);raise Error.new('Версія змінилася.') unless v.number==@selected.number
      v.files.splice(@file_index||0,1);await @store.save(p,v.files,'Видалено файл',Map.new());go('project',p.id)
    when 'trash','untrash'
      p=await @store.project(val);p.deleted=action=='trash';await @store.update(p,"#{p.name}: #{p.deleted ? 'у кошику' : 'відновлено'}");go(p.deleted ? 'trash' : 'project',p.deleted ? '' : p.id)
    when 'export','backup-out'
      p=await @store.project(@id)
      if action=='export'
        bytes=await @store.archive(@id,Number(val));await share_blob(bytes,"#{p.name}-v#{Number(val)}.zip")
      else
        bytes=await make_backup(@store,p);await share_blob(bytes,"#{p.name}-v#{p.version}.dvault")
      end
      flash('Файл підготовлено для збереження.')
    when 'read'
      await @store.set_pref('read_at',Date.now());flash('Події позначено прочитаними.')
    when 'login','register'
      go('auth',action)
    when 'logout'
      await @server.logout();@cloud=[];@detail=nil;go('server')
    when 'cloud-mine','cloud-public'
      @scope=action=='cloud-public' ? 'public' : 'mine';@query='';await refresh_cloud();go('cloud')
    when 'more'
      await refresh_cloud(true)
    when 'remote'
      @server.public_link(val);await @server.api('/repos/'+val+'?visit=1');go('remote',val)
    when 'remote-version'
      go('remote',@id,Number(val))
    when 'remote-file'
      f=@detail.files[Number(val)];q=await @server.api('/repos/'+@detail.repo.id+'/file?path='+encodeURIComponent(f.path)+'&version='+String(@detail.selected));@remote_file={name:f.path,text:q.text||'Двійковий або порожній файл.'};go('remote-preview',@detail.repo.id,@detail.selected)
    when 'web','remote-web'
      await open_site(action=='web' ? @server.origin : @server.public_link(@detail.repo.id))
    when 'share-link'
      link=@server.public_link(@detail.repo.id)
      if Capacitor.isNativePlatform()
        await Share.share({title:@detail.repo.name,url:link})
      else
        await navigator.clipboard.writeText(link);flash('Публічне посилання скопійовано.')
      end
    when 'pull'
      r=@detail.repo;n=@detail.selected;zip=await @server.download(r.id,n);all=await @store.listing();name=normalize_name(r.name);i=0
      while all.some {|s| s.name.toLowerCase()==name.toLowerCase()}
        i+=1;name=r.name.slice(0,48)+'-copy-'+String(i)
      end
      p=await @store.create(name,r.description,r.license)
      begin
        if @detail.files.length>0
          await @store.ingest(p,[File.new([zip],name+'.zip')],"Серверна копія v#{n}")
        end
      rescue => ex
        p=await @store.project(p.id);p.deleted=true;await @store.update(p,'Невдалий імпорт');await @store.erase(p,p.name);raise ex
      end
      go('project',p.id);flash('Копія збережена на пристрої.')
    end
  end
end

app=Pocket.new()
app.boot().catch do |ex|
  host=document.getElementById('app');host.textContent='Не вдалося відкрити локальне сховище. Оновіть Android System WebView та перевірте вільне місце. '+String(ex.message||'')
end
