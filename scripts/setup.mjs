import {randomBytes,scryptSync} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
let muted=false;const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk,encoding);callback()}});
const rl=createInterface({input:process.stdin,output,terminal:Boolean(process.stdin.isTTY)});
try{
 process.stdout.write('Choose a vault password (12+ characters; input hidden): ');muted=true;
 const password=await rl.question('');muted=false;process.stdout.write('\n');
 if(password.length<12||password.length>1024)throw new Error('Use a password between 12 and 1024 characters.');
 const salt=randomBytes(16);const hash=scryptSync(password,salt,64);
 console.log('\nPaste these two server-only values into Vercel Environment Variables:');
 console.log('AUTH_SECRET='+randomBytes(32).toString('hex'));
 console.log('VAULT_PASSWORD_HASH=scrypt:'+salt.toString('hex')+':'+hash.toString('hex'));
 console.log('\nAlso configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Do not commit these values.');
} catch(e){muted=false;console.error(e.message);process.exitCode=1}finally{rl.close()}
