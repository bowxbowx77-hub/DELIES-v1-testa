# Ruby2JS compiles this trusted application at build time. No user code is evaluated.
class VaultPolicy
  async def open()
    result = await fetch('vault.wasm')
    binary = await result.arrayBuffer()
    wasm = await WebAssembly.instantiate(binary, {})
    @core = wasm.instance.exports
    @address = @core.dv_buffer()
    @encoder = TextEncoder.new()
  end

  def check_bytes(data, fn, *args)
    raise Error.new('Перевищено ліміт буфера перевірки.') if data.length > @core.dv_capacity()
    Uint8Array.new(@core.memory.buffer, @address, data.length).set(data)
    status = @core[fn].call(nil, data.length, *args)
    errors = ['', 'Небезпечний шлях до файлу.', 'Знайдено службові дані, ключ або заблоковану сигнатуру.', 'Цей тип файлу чи архіву не підтримується.', 'Пошкоджений архів або перевищений ліміт розміру.']
    raise Error.new(errors[status] || 'Помилка перевірки.') unless status == 0
  end

  def path(name, zip=false)
    cleaned = name.normalize('NFC')
    raise Error.new('Неприпустимі символи у шляху.') if /[\u202A-\u202E\u2066-\u2069]/.test(cleaned)
    check_bytes(@encoder.encode(cleaned), 'dv_path', zip ? 1 : 0)
    return cleaned
  end

  def content(buf)
    i = 0
    while i < buf.length
      check_bytes(buf.subarray(Math.max(0,i-96),Math.min(buf.length,i+65536)), 'dv_scan', i == 0 ? 1 : 0)
      i += 65536
    end
  end

  def entry(e)
    code = @core.dv_entry(e.uncompressedSize, e.compressedSize, (e.externalFileAttributes >> 16) & 65535, e.encrypted ? 1 : 0, e.compressionMethod)
    raise Error.new('ZIP містить заборонений або надмірний запис.') unless code == 0
  end
end
