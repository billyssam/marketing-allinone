export interface AuthHealthSettings {
  disable_signup?: boolean;
  mailer_autoconfirm?: boolean;
}

/** 운영 선언과 실제 Auth 설정을 대조한다. SMTP 선언은 수신 성공 증거가 아니다. */
export function authConfigurationProblems(
  settings: AuthHealthSettings,
  config: { signupMode?: string; smtpDeclared: boolean },
): string[] {
  const problems: string[] = [];
  if (config.signupMode === 'invite' && settings.disable_signup !== true) {
    problems.push('초대 전용이라고 선언했지만 Auth 공개 가입이 닫혀 있지 않습니다. 운영 모드와 실제 가입 설정을 일치시켜주세요.');
  }
  // 가입 확인을 끄거나 초대만 받아도 비밀번호 복구는 메일에 의존한다.
  if (!config.smtpDeclared) {
    problems.push('운영 SMTP 준비가 확인되지 않았습니다. 가입 모드와 별개로 비밀번호 복구 메일을 실제로 수신할 수 있어야 합니다. 관리자 SMTP·발송 제한을 확인하고 가입/복구 수신 검증 후 준비 상태를 등록해주세요.');
  }
  return problems;
}
