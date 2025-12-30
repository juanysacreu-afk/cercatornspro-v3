
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hcpjthnhockfbefclycr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjcGp0aG5ob2NrZmJlZmNseWNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3Nzc0MjgsImV4cCI6MjA4MDM1MzQyOH0.fj1G4Nc8Vxk5OrZuWQhDLLVgjvcQHz5rNdYkHBiAEok';

export const supabase = createClient(supabaseUrl, supabaseKey);
