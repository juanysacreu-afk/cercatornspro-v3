
import { PostgrestQueryBuilder } from '@supabase/postgrest-js';

export async function fetchAllFromSupabase(table: string, queryBuilder: any) {
    let allData: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await queryBuilder.range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) {
            hasMore = false;
        } else {
            allData = [...allData, ...data];
            page++;
            if (data.length < pageSize) hasMore = false;
        }
    }
    return allData;
}
