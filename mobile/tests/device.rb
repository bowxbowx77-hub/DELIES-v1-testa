#!/usr/bin/env ruby
# Actual user interactions with a non-debuggable release on a disposable emulator.
require 'open3'
require 'rexml/document'

module DeviceSmoke
  extend self
  APP = 'org.devvault.pocket'

  def adb(*args)
    out, status = Open3.capture2e('adb', *args)
    raise "adb failed: #{out[0, 300]}" unless status.success?
    out
  end

  def nodes
    adb('shell', 'uiautomator', 'dump', '/sdcard/dv-ui.xml')
    xml = adb('exec-out', 'cat', '/sdcard/dv-ui.xml')
    REXML::XPath.match(REXML::Document.new(xml), '//node')
  end

  def find_node(label = nil, klass: nil, scroll: false)
    last = []
    9.times do |iteration|
      list = nodes
      last = list.flat_map { |n| %w[text content-desc].map { |a| n.attributes[a] } }.compact.reject(&:empty?).uniq
      candidates = list.select do |n|
        bounds = n.attributes['bounds'].to_s.scan(/\d+/).map(&:to_i)
        (!klass || n.attributes['class'] == klass) &&
          (!label || %w[text content-desc].any? { |a| n.attributes[a].to_s.include?(label) }) &&
          bounds.size == 4 && bounds[0] < bounds[2] && bounds[1] < bounds[3]
      end
      exact = candidates.find { |n| label && %w[text content-desc].any? { |a| n.attributes[a] == label } }
      return exact || candidates.first unless candidates.empty?
      adb('shell', 'input', 'swipe', '550', '1400', '550', '580', '400') if scroll && iteration >= 1
      sleep 0.4
    end
    raise "Missing UI element #{label || klass}. Visible: #{last.join(' / ')[0, 1500]}"
  end

  def tap_node(label = nil, **options)
    node = find_node(label, **options)
    x, y, right, bottom = node.attributes['bounds'].scan(/\d+/).map(&:to_i)
    adb('shell', 'input', 'tap', ((x + right) / 2).to_s, ((y + bottom) / 2).to_s)
  end

  def launch
    adb('shell', 'am', 'start', '-W', '-n', "#{APP}/.MainActivity")
  end

  def run(apk)
    emulator = %w[ro.kernel.qemu ro.boot.qemu].any? { |key| adb('shell', 'getprop', key).strip == '1' }
    raise 'Disposable emulator required' unless emulator
    adb('install', '-r', apk)
    adb('shell', 'pm', 'clear', APP)
    adb('shell', 'wm', 'size', '1080x1920')
    adb('shell', 'wm', 'density', '220')
    adb('shell', 'wm', 'dismiss-keyguard')
    adb('shell', 'svc', 'wifi', 'disable')
    adb('shell', 'svc', 'data', 'disable')
    launch
    tap_node('Новий проєкт')
    tap_node(klass: 'android.widget.EditText')
    adb('shell', 'input', 'text', 'device-qa')
    adb('shell', 'input', 'keyevent', '111')
    tap_node('Зберегти')
    find_node('device-qa')
    tap_node('Додати файли')
    tap_node('Створити файл', scroll: true)
    tap_node('README.md')
    find_node('Редагувати текст')
    tap_node(klass: 'android.widget.EditText')
    adb('shell', 'input', 'text', 'offline-content-123')
    adb('shell', 'input', 'keyevent', '111')
    tap_node('Зберегти текст', scroll: true)
    find_node('v3')
    adb('shell', 'am', 'force-stop', APP)
    launch
    tap_node('Сховище')
    tap_node('device-qa')
    tap_node('README.md')
    find_node('offline-content-123')
    puts 'Verified signed APK: offline launch, project/file creation, edit, force-stop, relaunch, persistent file bytes.'
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    DeviceSmoke.run(ARGV.fetch(0))
  rescue StandardError => error
    warn "::error::#{error.message.gsub(/[\r\n]/, ' ')}"
    exit 1
  end
end
