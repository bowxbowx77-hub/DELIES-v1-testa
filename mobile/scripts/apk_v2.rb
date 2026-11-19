#!/usr/bin/env ruby
# Offline APK Signature Scheme v2, single RSA signer, SHA-256 (minSdk 26).
# The private key never goes to CI. Android SDK apksigner independently verifies
# the finished package before a release is allowed. See docs/ANDROID.md.
require 'openssl'
require 'digest'
require 'json'
module ApkV2
  extend self
  ALGO=0x0103
  ID=0x7109871a
  MAGIC='APK Sig Block 42'.b
  def u32(n) = [n].pack('V')
  def u64(n) = [n].pack('Q<')
  def lp(bytes) = u32(bytes.bytesize)+bytes
  def sections(apk)
    start=apk.rindex("PK\x05\x06".b) or raise 'Missing ZIP EOCD'
    tail=apk.byteslice(start..);raise 'Invalid ZIP comment' unless tail.bytesize>=22 && 22+tail.byteslice(20,2).unpack1('v')==tail.bytesize
    disk,cd_disk,n,all,size,offset=tail.byteslice(4,16).unpack('vvvvVV')
    raise 'Unsupported APK ZIP layout' unless disk==0 && cd_disk==0 && n==all && all<65535 && offset+size==start && apk.byteslice(offset,4)=="PK\x01\x02".b
    raise 'Already signed; start with unsigned output' if offset>=16 && apk.byteslice(offset-16,16)==MAGIC
    [apk.byteslice(0,offset),apk.byteslice(offset,size),tail]
  end
  def content_digest(parts)
    hashes=''.b
    parts.each do |part|
      i=0
      while i<part.bytesize
        chunk=part.byteslice(i,1024*1024);hashes<<Digest::SHA256.digest("\xA5".b+u32(chunk.bytesize)+chunk);i+=chunk.bytesize
      end
    end
    Digest::SHA256.digest("\x5A".b+u32(hashes.bytesize/32)+hashes)
  end
  def signed_data(digest, cert)
    raise 'Invalid digest' unless digest.bytesize==32
    lp(lp(u32(ALGO)+lp(digest)))+lp(lp(cert.to_der))+lp(''.b)
  end
  def apply(apk,cert,doc)
    raise 'Wrong unsigned APK' unless Digest::SHA256.hexdigest(apk)==doc.fetch('unsigned_sha256')
    parts=sections(apk);digest=content_digest(parts)
    raise 'Mismatched content digest' unless digest.unpack1('H*')==doc.fetch('content_digest')
    raise 'Certificate mismatch' unless Digest::SHA256.hexdigest(cert.to_der)==doc.fetch('certificate_sha256')
    data=signed_data(digest,cert);sig=doc.fetch('signature').unpack1('m0')
    raise 'Invalid offline signature' unless cert.public_key.verify('SHA256',sig,data)
    signer=lp(data)+lp(lp(u32(ALGO)+lp(sig)))+lp(cert.public_key.public_to_der)
    value=lp(lp(signer));pair=u64(value.bytesize+4)+u32(ID)+value
    size=u64(pair.bytesize+24);block=size+pair+size+MAGIC
    parts[2][16,4]=u32(parts[0].bytesize+block.bytesize)
    parts[0]+block+parts[1]+parts[2]
  end
end
if $PROGRAM_NAME==__FILE__
  case ARGV.shift
  when 'inspect'
    apk=File.binread(ARGV.fetch(0));puts [Digest::SHA256.hexdigest(apk),ApkV2.content_digest(ApkV2.sections(apk)).unpack1('H*')].join('-')
  when 'apply'
    input,cert,manifest,out=ARGV;File.binwrite(out,ApkV2.apply(File.binread(input),OpenSSL::X509::Certificate.new(File.read(cert)),JSON.parse(File.read(manifest))))
  else;abort 'Usage: apk_v2.rb inspect UNSIGNED | apply UNSIGNED CERT MANIFEST OUT'
  end
end
