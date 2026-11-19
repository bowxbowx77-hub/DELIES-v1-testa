#!/usr/bin/env ruby
# Owner-side approval of a specific successful CI build. No private material is uploaded.
require_relative 'apk_v2'
require 'open3'
require 'fileutils'
Dir.chdir(File.expand_path('..',__dir__))
def cmd(*args)
  out,status=Open3.capture2(*args);abort("Command failed: #{args.first}") unless status.success?;out.strip
end
run_id=Integer(ARGV.fetch(0)); repo=JSON.parse(cmd('gh','repo','view','--json','nameWithOwner')).fetch('nameWithOwner')
run=JSON.parse(cmd('gh','api',"repos/#{repo}/actions/runs/#{run_id}")); head=cmd('git','rev-parse','HEAD');branch=cmd('git','branch','--show-current')
abort 'Approve only a successful Android APK push of the exact checked out commit/branch' unless run['name']=='Android APK' && run['head_repository']['full_name']==repo && run['head_branch']==branch && run['event']=='push' && run['head_sha']==head && run['conclusion']=='success'
name=JSON.parse(cmd('gh','api',"repos/#{repo}/actions/runs/#{run_id}/artifacts")).fetch('artifacts').map{|a|a['name']}.find{|n|n.match?(/\Aapk-([0-9a-f]{64})-([0-9a-f]{64})\z/)} or abort 'Missing CI signing request'
_,unsigned,digest=name.split('-');cert=OpenSSL::X509::Certificate.new(File.read('signing/release.pem'));priv=ENV.fetch('DEVVAULT_SIGN_DIR',File.expand_path('../.devvault-signing'));key=OpenSSL::PKey.read(File.read(File.join(priv,'release.key')),File.read(File.join(priv,'key.pass')).strip)
abort 'Wrong signing key' unless cert.check_private_key(key)
version=File.read('VERSION').strip;abort 'Invalid version' unless version.match?(/\A\d+\.\d+\.\d+\z/)
record={'version'=>version,'build_run'=>run_id,'source_commit'=>head,'branch'=>branch,'unsigned_sha256'=>unsigned,'content_digest'=>digest,'certificate_sha256'=>Digest::SHA256.hexdigest(cert.to_der),'signature'=>Base64.strict_encode64(key.sign('SHA256',ApkV2.signed_data([digest].pack('H*'),cert)))}
FileUtils.mkdir_p('releases');File.open("releases/#{version}.json",'wx'){|f|f.puts JSON.pretty_generate(record)};puts "Approved #{head} (#{unsigned}) for v#{version}. Commit the public approval to request distribution."
