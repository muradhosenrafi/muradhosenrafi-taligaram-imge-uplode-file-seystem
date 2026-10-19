import {redirect} from 'next/navigation';
import {authReady,hasSession} from '../../lib/auth';
import {databaseReady} from '../../lib/store';
import Login from './screen';
export const dynamic='force-dynamic';
export default async function Page(){if(await hasSession())redirect('/');return <Login configured={Boolean(authReady()&&databaseReady())}/>}
