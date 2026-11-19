// DEVVAULT's import policy. This freestanding C++ module is shipped as WebAssembly
// in the APK, so the exact same tested checks run on every Android CPU architecture.
// Callers own the storage/transaction. This code never interprets a project's code.
using u8 = unsigned char;
using u32 = unsigned int;
static u8 input[131072];
static u32 length(const char* text) { u32 i=0; while(text[i]) ++i; return i; }
static u8 lower(u8 x) { return x >= 'A' && x <= 'Z' ? x+32 : x; }
static bool eq(const u8* p,u32 n,const char* s) {
    if(n!=length(s)) return false;
    for(u32 i=0;i<n;++i) if(lower(p[i])!=u8(s[i])) return false;
    return true;
}
static bool has(const u8* p,u32 n,const char* s) {
    const auto m=length(s); if(!m || m>n) return false;
    for(u32 i=0;i<=n-m;i++) {u32 j=0; while(j<m && p[i+j]==u8(s[j])) ++j; if(j==m) return true;}
    return false;
}
extern "C" {
u8* dv_buffer(){return input;}
u32 dv_capacity(){return sizeof(input);}
// 1 unsafe path, 2 credential/metadata, 3 unsupported file type.
int dv_path(u32 n, int allow_zip) {
    if(!n || n>512 || input[n-1]=='/') return 1;
    u32 start=0,depth=0;
    for(u32 i=0;i<=n;i++) {
        if(i<n && input[i]!='/') {
            if(input[i]<32 || input[i]==127 || input[i]=='\\' || input[i]==':' || input[i]=='<' || input[i]=='>' || input[i]=='|' || input[i]=='?' || input[i]=='*' || input[i]=='"') return 1;
            continue;
        }
        auto size=i-start; const u8* part=input+start;
        if(!size || size>200 || ++depth>24 || part[size-1]=='.' || part[size-1]==' ') return 1;
        const char* secret[]={".git",".svn",".hg",".aws",".ssh","id_rsa","id_ed25519"};
        for(auto s:secret) if(eq(part,size,s)) return 2;
        if(size>=4 && eq(part,4,".env") && !eq(part,size,".env.example") && !eq(part,size,".env.sample")) return 2;
        if(i==n) {
            u32 dot=size; for(u32 j=0;j<size;j++) if(part[j]=='.') dot=j;
            const char* blocked[]={".exe",".dll",".com",".msi",".scr",".lnk",".sys",".bat",".cmd",".pif",".apk",".dmg",".iso",".so",".dylib",".pyd",".class",".jar",".wasm",".vbs",".ps1",".hta",".chm",".pem",".p12",".pfx",".rar",".7z",".gz",".xz",".tar",".bz2"};
            for(auto s:blocked) if(eq(part+dot,size-dot,s)) return 3;
            if(!allow_zip && eq(part+dot,size-dot,".zip")) return 3;
        }
        start=i+1;
    }
    return 0;
}
// Probe each bounded chunk with a 96-byte overlap; catches signatures crossing reads.
int dv_scan(u32 n,int first) {
    if(n>sizeof(input)) return 4;
    if(first && ((n>=2 && input[0]=='M' && input[1]=='Z') || (n>=4 && ((input[0]==127 && input[1]=='E' && input[2]=='L' && input[3]=='F') || (input[0]=='P' && input[1]=='K' && input[2]==3 && input[3]==4) || (input[0]==0 && input[1]=='a' && input[2]=='s' && input[3]=='m'))))) return 3;
    const char* signatures[]={"EICAR-STANDARD-ANTIVIRUS-TEST-FILE","-----BEGIN PRIVATE KEY-----","-----BEGIN RSA PRIVATE KEY-----","-----BEGIN OPENSSH PRIVATE KEY-----","-----BEGIN EC PRIVATE KEY-----","-----BEGIN ENCRYPTED PRIVATE KEY-----"};
    for(auto s:signatures) if(has(input,n,s)) return 2;
    return 0;
}
static u32 word(const u8* b) {return u32(b[0]) | (u32(b[1])<<8);}
static u32 dword(const u8* b) {return word(b) | (word(b+2)<<16);}
// Reject unbounded central directory allocation before asking the ZIP library to parse.
int dv_zip_tail(u32 n,u32 archive_size) {
    if(n>65557 || n<22 || n>archive_size || archive_size>128*1024*1024u) return 4;
    for(int pos=int(n)-22;pos>=0;--pos) {
        auto p=input+pos;
        if(dword(p)!=0x06054b50u || u32(pos)+22+word(p+20)!=n) continue;
        auto count=word(p+10),size=dword(p+12),off=dword(p+16);
        const u32 end=archive_size-n+u32(pos);
        if(pos>=20 && dword(p-20)==0x07064b50u) return 4; // ZIP64 locator
        return (word(p+4) || word(p+6) || word(p+8)!=count || count>2000 || size>2097152 || off>end || size!=end-off) ? 4 : 0;
    }
    return 4;
}
int dv_entry(double size,double compressed,int mode,int encrypted,int method) {
    if(!(size>=0 && size<=33554432 && compressed>=0 && compressed<=134217728) || (size>1048576 && size>250*(compressed>0?compressed:1))) return 4;
    auto type=mode&0170000;
    return (encrypted || (method!=0 && method!=8) || (type!=0 && type!=0100000 && type!=0040000)) ? 3 : 0;
}
}
