import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jptzcervvbsxotywqdjq.supabase.co';
const supabaseAnonKey = 'sb_publishable_-wtsn1-oIa1yUvXEq5n46Q_MTINGZpS';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
