# Standard HTTPS fetch streams bytes without passing an archive through a native
# base64 bridge. No cookies or redirects. The server explicitly allows the APK's
# single bundled origin; other sites do not receive a cross-origin grant.
class VaultServer
  attr_reader :origin, :user
  def load_origin(origin)
    @origin=origin || ''; @token=''; @user=nil
  end
  def validate(raw)
    u=URL.new(String(raw).trim())
    raise Error.new('Введіть лише HTTPS-адресу свого сервера, без шляху, пароля чи параметрів.') unless u.protocol=='https:' && u.hostname && u.pathname=='/' && !u.username && !u.password && !u.search && !u.hash
    return u.origin
  end
  def auth_headers()
    h={'X-DevVault-Request'=>'workspace','X-DevVault-Client'=>'pocket'}
    h['Authorization']="Bearer #{@token}" if @token
    return h
  end
  async def request_data(path,method,body,json=false)
    raise Error.new('Спершу додайте адресу сервера.') unless @origin
    h=auth_headers();h['Content-Type']='application/json' if json
    opts={method:method,headers:h,mode:'cors',credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(180000)}
    opts.body=body if body
    r=await fetch(@origin+'/api'+path,opts)
    unless r.ok
      failure=await r.json().catch(->(ex) { nil });raise Error.new((failure && failure.error) || "HTTP #{r.status}")
    end
    return r
  end
  async def api(path,method='GET',data=nil)
    payload=data ? JSON.stringify(data) : nil
    r=await request_data(path,method,payload,data!=nil);return await r.json()
  end
  async def configure_origin(value)
    addr=validate(value);prev=@origin
    if prev!=addr
      @token=''; @user=nil
    end
    @origin=addr
    begin
      info=await api('/health');raise Error.new('Це не сервер DEVVAULT.') unless info.status=='online' && info.storage=='sqlite'
    rescue => error
      @origin=prev;raise error
    end
  end
  async def auth(mode,fields)
    r=await api('/mobile/'+mode,'POST',fields)
    raise Error.new('Сервер не підтримує Pocket 1.1. Оновіть DEVVAULT.') unless r.user && /\Advm_[a-zA-Z0-9_-]{54}\z/.test(r.token)
    @token=r.token; @user=r.user
  end
  async def logout()
    begin
      await api('/mobile/logout','POST') if @token
    ensure
      @token=''; @user=nil
    end
  end
  def public_link(id)
    raise Error.new('Неприпустимий ID.') unless /\A[0-9a-f]{32}\z/.test(id)
    return @origin+'/r/'+id
  end
  def linked(p)
    return @user && p.remote && p.remote.origin==@origin && p.remote.owner==@user.id
  end
  async def publish(store,p,name,visibility)
    raise Error.new('Увійдіть на свій сервер.') unless @user
    raise Error.new('Додайте хоча б один файл.') unless p.count>0
    raise Error.new('Неприпустима видимість.') unless ['private','public'].includes(visibility)
    zip=await store.archive(p.id,p.version)
    if linked(p)
      id=p.remote.id;base=p.remote.base
    else
      r=await api('/repos','POST',{name:normalize_name(name),description:p.description,license:p.license,visibility:'private',readme:false})
      id=r.id;base=1
    end
    public_link(id);form=FormData.new();form.append('files',zip,'snapshot.zip');form.append('base',String(base));form.append('message',"Pocket · #{p.name} v#{p.version}");form.append('snapshot_visibility',visibility)
    result=await request_data('/repos/'+id+'/upload','POST',form);receipt=await result.json()
    raise Error.new('Сервер не підтвердив точний знімок.') unless receipt.snapshot==true && receipt.files==p.count && receipt.number==base+1
    p.remote={origin:@origin,owner:@user.id,id:id,base:receipt.number,version:p.version,visibility:visibility}
    await store.update(p,"#{p.name}: підтверджено збереження на сервері");return p.remote
  end
  async def download(id,n)
    public_link(id)
    r=await request_data('/repos/'+id+'/download?version='+String(Number(n)),'GET',nil)
    reader=r.body.getReader();chunks=[];total=0
    begin
      raise Error.new('Архів перевищує 128 МіБ.') if Number(r.headers.get('Content-Length'))>134217728
      loop do
        part=await reader.read();break if part.done
        total+=part.value.byteLength;raise Error.new('Архів перевищує 128 МіБ.') if total>134217728
        chunks.push(part.value)
      end
      return Blob.new(chunks,{type:'application/zip'})
    ensure
      await reader.cancel().catch(->(ex){nil})
    end
  end
end
