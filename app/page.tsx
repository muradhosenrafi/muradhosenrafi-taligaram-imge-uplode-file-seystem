import {redirect} from 'next/navigation';
import {hasSession} from '../lib/auth';
import Vault from './vault';
export const dynamic='force-dynamic';
export default async function Home(){if(!await hasSession())redirect('/login');return <Vault/>}
