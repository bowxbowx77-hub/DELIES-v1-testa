# Configure only the generated Android project. Never touch an operator's SDK or keys.
require 'fileutils'
base = File.expand_path('..', __dir__)
Dir.chdir(base) do
  gradle = 'android/app/build.gradle'
  File.write(gradle, File.read(gradle).sub(/versionCode \d+/, "versionCode #{Integer(File.read('VERSION_CODE'))}").sub(/versionName "[^"]+"/, "versionName \"#{File.read('VERSION').strip}\""))
  manifest = 'android/app/src/main/AndroidManifest.xml'
  xml = File.read(manifest).sub(/android:allowBackup="[^"]*"/, 'android:allowBackup="false"')
  xml = xml.sub('<application', '<application android:usesCleartextTraffic="false"') unless xml.include?('android:usesCleartextTraffic')
  File.write(manifest,xml)
  vars='android/variables.gradle'
  File.write(vars,File.read(vars).sub(/minSdkVersion = \d+/,'minSdkVersion = 26'))
  draw='android/app/src/main/res/drawable'
  FileUtils.mkdir_p(draw)
  File.write("#{draw}/vault_mark.xml", <<~XML)
    <vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><path android:fillColor="#142218" android:pathData="M0,0h108v108h-108z"/><path android:strokeColor="#B1EF80" android:strokeWidth="4" android:strokeLineJoin="round" android:fillColor="#00000000" android:pathData="M25,43 L54,29 L83,43 L54,57 Z M25,54 L54,68 L83,54 M25,65 L54,79 L83,65"/></vector>
  XML
  File.write(manifest,File.read(manifest).gsub(/@mipmap\/ic_launcher(?:_round)?/, '@drawable/vault_mark'))
  styles='android/app/src/main/res/values/styles.xml'
  File.write(styles,File.read(styles).gsub('@drawable/splash','@drawable/vault_mark'))
end
