#!/usr/bin/env ruby
# Exercise a signed, non-debuggable APK as a user, using Android's own UI tree.
# Only run on a disposable emulator. No app-private inspection or production key.
require 'open3'
require 'rexml/document'
APP='org.devvault.pocket'
def adb(*args)
  out,status=Open3.capture2e('adb',*args); raise "adb failed: #{out[0,300]}" unless status.success?; out
end
def nodes
  adb('shell','uiautomator','dump','/sdcard/dv-ui.xml');xml=adb('exec-out','cat','/sdcard/dv-ui.xml'); REXML::XPath.match(REXML::Document.new(xml),'//node')
end
def find(label=nil,klass:nil,scroll:false)
  last=[]
  9.times do |i|
    list=nodes;last=list.flat_map{|n| [n.attributes['text'],n.attributes['content-desc']]}.compact.reject(&:empty?).uniq
    node=list.find{|n| (!klass || n.attributes['class']==klass) && (!label || %w[text content-desc].any?{|a| n.attributes[a].to_s.include?(label)}) && n.attributes['bounds'].to_s.scan(/\d+/).map(&:to_i).then{|b| b.size==4 && b[0]<b[2] && b[1]<b[3]}}
    return node if node
    adb('shell','input','swipe','550','1400','550','580','400') if scroll && i>=1
    sleep 0.4
  end
  raise "Missing UI element #{label||klass}. Visible: #{last.join(' / ')[0,1500]}"
end
def tap(text=nil,**opts)
  node=find(text,**opts); x,y,r,b=node.attributes['bounds'].scan(/\d+/).map(&:to_i);adb('shell','input','tap',((x+r)/2).to_s,((y+b)/2).to_s)
end
def launch
  adb('shell','am','start','-W','-n',"#{APP}/.MainActivity")
end
begin
  abort 'Disposable emulator required' unless adb('shell','getprop','ro.kernel.qemu').strip=='1' || adb('shell','getprop','ro.boot.qemu').strip=='1'
  adb('install','-r',ARGV.fetch(0));adb('shell','pm','clear',APP);adb('shell','wm','size','1080x1920');adb('shell','wm','density','220');adb('shell','svc','wifi','disable');adb('shell','svc','data','disable');launch
  tap('Новий проєкт');tap(klass:'android.widget.EditText');adb('shell','input','text','device-qa');adb('shell','input','keyevent','111');tap('Зберегти');find('device-qa');tap('Додати файли');tap('Створити файл',scroll:true);find('README.md');tap('README.md');find('Редагувати текст');tap(klass:'android.widget.EditText');adb('shell','input','text','offline-content-123');adb('shell','input','keyevent','111');tap('Зберегти текст',scroll:true);find('v3');adb('shell','am','force-stop',APP);launch;tap('device-qa');tap('README.md');find('offline-content-123');puts 'Verified signed APK: offline launch, project and file creation, edit, force-stop, relaunch, persisted file bytes.'
rescue => e
  warn "::error::#{e.message.gsub(/[\r\n]/,' ')}"; exit 1
end
