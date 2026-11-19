#!/usr/bin/env ruby
# Publisher-side approval of one precise, successful build. Private key stays here.
require_relative 'apk_v2'
require 'open3'
require 'fileutils'
Dir.chdir(File.expand_path('..', __dir__))

def cmd(*args)
  out, status = Open3.capture2(*args)
  abort "Command failed: #{args.first}" unless status.success?
  out.force_encoding(Encoding::UTF_8).strip
end

supersede = ARGV.delete('--replace-unpublished')
run_id = Integer(ARGV.fetch(0))
repo = JSON.parse(cmd('gh', 'repo', 'view', '--json', 'nameWithOwner')).fetch('nameWithOwner')
run = JSON.parse(cmd('gh', 'api', "repos/#{repo}/actions/runs/#{run_id}"))
head = cmd('git', 'rev-parse', 'HEAD')
branch = cmd('git', 'branch', '--show-current')
valid = run['name'] == 'Android APK' && run.dig('head_repository', 'full_name') == repo &&
  run['head_branch'] == branch && run['event'] == 'push' && run['head_sha'] == head && run['conclusion'] == 'success'
abort 'Only approve a successful Android APK push of the checked-out commit and branch' unless valid
names = JSON.parse(cmd('gh', 'api', "repos/#{repo}/actions/runs/#{run_id}/artifacts")).fetch('artifacts').reject { |a| a['expired'] }.map { |a| a['name'] }
request = names.grep(/\Aapk-[0-9a-f]{64}-[0-9a-f]{64}\z/)
abort 'Expected a single CI signing request' unless request.length == 1
_, unsigned, digest = request.first.split('-')
cert = OpenSSL::X509::Certificate.new(File.read('signing/release.pem'))
priv = ENV.fetch('DEVVAULT_SIGN_DIR', File.expand_path('../.devvault-signing'))
key = OpenSSL::PKey.read(File.binread(File.join(priv, 'release.key')), File.read(File.join(priv, 'key.pass')).strip)
abort 'Wrong signing key' unless cert.check_private_key(key)
version = File.read('VERSION').strip
abort 'Invalid version' unless version.match?(/\A\d+\.\d+\.\d+\z/)
abort 'A published tag cannot be superseded. Increment VERSION and VERSION_CODE.' unless cmd('git', 'ls-remote', '--tags', 'origin', "refs/tags/android-v#{version}").empty?
file = "releases/#{version}.json"
abort 'An approval already exists. Replace a failed candidate only with --replace-unpublished.' if File.exist?(file) && !supersede
signature = key.sign('SHA256', ApkV2.signed_data([digest].pack('H*'), cert))
record = {'version'=>version, 'build_run'=>run_id, 'source_commit'=>head, 'branch'=>branch,
  'unsigned_sha256'=>unsigned, 'content_digest'=>digest, 'certificate_sha256'=>Digest::SHA256.hexdigest(cert.to_der), 'signature'=>[signature].pack('m0')}
FileUtils.mkdir_p('releases')
tmp = "#{file}.tmp"
File.open(tmp, 'wx') { |f| f.puts JSON.pretty_generate(record) }
File.rename(tmp, file)
puts "Approved #{head} (#{unsigned}) for v#{version}. Only the public record belongs in Git."
