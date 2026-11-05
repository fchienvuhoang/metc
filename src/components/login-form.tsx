import { LogIn } from "lucide-react";

const ERRORS: Record<string, string> = {
  access_denied: "Email này không có quyền đăng nhập hệ thống.",
  invalid_state: "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng thử lại.",
  cancelled: "Bạn đã hủy đăng nhập Google.",
  oauth_failed: "Không thể đăng nhập Google. Vui lòng thử lại.",
  not_configured: "Google SSO chưa được cấu hình.",
};

export function LoginForm({ authConfigured, nextPath, error }: {
  authConfigured: boolean; nextPath: string; error?: string;
}) {
  const message = !authConfigured ? ERRORS.not_configured : error ? ERRORS[error] || ERRORS.oauth_failed : null;
  return (
    <div className="mt-5 space-y-4">
      {message ? <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{message}</div> : null}
      {authConfigured ? (
        <a href={`/api/auth/google?next=${encodeURIComponent(nextPath)}`} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-700 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-800">
          <LogIn className="h-4 w-4" />Đăng nhập bằng Google
        </a>
      ) : <button disabled className="w-full rounded-lg bg-indigo-700 px-3 py-2 text-sm text-white opacity-60">Đăng nhập bằng Google</button>}
    </div>
  );
}
