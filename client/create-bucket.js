import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://zzpioqnkzfczzttvnsmx.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6cGlvcW5remZjenp0dHZuc214Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMjg3NTcsImV4cCI6MjEwNDYwNDc1N30.5HEKFWVHxZ3fQFXX2q3dEo9JJF4Ae0EJxlg39tyTKbw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.storage.createBucket('settlement-proofs', {
    public: true,
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    fileSizeLimit: 1048576, // 1MB
  });
  
  if (error) {
    console.error('Failed to create bucket:', error);
  } else {
    console.log('Bucket created successfully:', data);
  }
}

main();
