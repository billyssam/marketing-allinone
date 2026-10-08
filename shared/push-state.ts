export function devicePushEnabled(endpoint: string | undefined, savedEndpoints: string[], permitted: boolean): boolean {
  return permitted && Boolean(endpoint && savedEndpoints.includes(endpoint));
}

/** 실패한 SW 등록/네트워크가 설정 화면을 무한 대기로 만들지 않게 한다. */
export async function bounded<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('연결이 지연되고 있어요. 잠시 후 다시 시도해주세요.')), ms);
    })]);
  } finally { clearTimeout(timer); }
}
