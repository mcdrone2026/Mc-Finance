import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://epfvnjldxfnxvpodrydk.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_Ja2fdnaL2Yiw3jH3nSZ5fg_-WdrHYkj';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
