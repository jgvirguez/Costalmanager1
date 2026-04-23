import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tongycbcmxwbihhtyprn.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvbmd5Y2JjbXh3YmloaHR5cHJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTEyODEsImV4cCI6MjA5MDI2NzI4MX0.oDggiUR0GAncFAeDDVdCnKIijTJtD3Gg5PyTN2liDDw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
