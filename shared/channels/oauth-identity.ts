/** Verify channel identity with read-only provider calls before recording a connection. */
export async function verifyOAuthIdentity(channel: string, token: string, fetcher: typeof fetch = fetch): Promise<{ externalId: string }> {
  async function read(url: string): Promise<any> {
    const response = await fetcher(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`계정 확인 실패 (${response.status})`);
    const data = await response.json();
    if (!data || data.error) throw new Error('계정 응답을 확인하지 못했습니다');
    return data;
  }
  if (channel === 'instagram') {
    const permissions = await read('https://graph.facebook.com/v21.0/me/permissions');
    const granted = new Set((Array.isArray(permissions.data) ? permissions.data : [])
      .filter((p: any) => p.status === 'granted').map((p: any) => p.permission));
    for (const permission of ['instagram_basic', 'instagram_content_publish', 'pages_show_list']) {
      if (!granted.has(permission)) throw new Error('필수 계정 권한이 승인되지 않았습니다');
    }
    const pages = await read('https://graph.facebook.com/v21.0/me/accounts?fields=id,instagram_business_account&limit=100');
    const ids = [...new Set((Array.isArray(pages.data) ? pages.data : [])
      .map((p: any) => p.instagram_business_account?.id).filter((id: unknown) => typeof id === 'string' && /^\d+$/.test(id)))];
    // Never choose a random business when multiple accounts exist. Selection UI is required first.
    if (pages.paging?.next || ids.length !== 1) throw new Error('연결할 인스타 계정을 하나로 확인하지 못했습니다');
    return { externalId: ids[0] as string };
  }
  if (channel === 'google_business') {
    const accounts = await read('https://mybusinessaccountmanagement.googleapis.com/v1/accounts');
    if (accounts.nextPageToken || !Array.isArray(accounts.accounts) || !accounts.accounts.length) throw new Error('관리할 구글 계정을 확인하지 못했습니다');
    const ids = new Set<string>();
    for (const account of accounts.accounts) {
      if (typeof account.name !== 'string' || !/^accounts\/\d+$/.test(account.name)) throw new Error('계정 식별자가 올바르지 않습니다');
      const locations = await read(`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name&pageSize=100`);
      if (locations.nextPageToken) throw new Error('여러 매장은 선택 절차가 필요합니다');
      for (const location of locations.locations ?? []) {
        if (typeof location.name !== 'string' || !/^locations\/\d+$/.test(location.name)) throw new Error('매장 식별자가 올바르지 않습니다');
        ids.add(location.name);
      }
    }
    if (ids.size !== 1) throw new Error('연결할 구글 매장을 하나로 확인하지 못했습니다');
    return { externalId: [...ids][0] };
  }
  throw new Error('지원하지 않는 계정 연결입니다');
}
