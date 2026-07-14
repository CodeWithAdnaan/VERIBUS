export function isMockDbEnabled(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const dbUrl = process.env.SUPABASE_DB_URL;
  return !url || url.includes('YOUR-PROJECT') || url === '' || !dbUrl || dbUrl.includes('YOUR-PROJECT') || dbUrl.includes('PASSWORD@');
}
