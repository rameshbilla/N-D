// Server-only configuration (read from environment variables at runtime).
// Nothing in src/server/** is ever bundled into the browser.

const env = (k: string) => process.env[k] ?? '';
const int = (k: string, d: number) => {
  const n = Number.parseInt(env(k), 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const config = {
  get siteUrl() {
    return (env('SITE_URL') || 'http://localhost:4200').replace(/\/$/, '');
  },
  get supabaseUrl() {
    return env('SUPABASE_URL');
  },
  get supabaseAnonKey() {
    return env('SUPABASE_ANON_KEY') || env('SUPABASE_PUBLISHABLE_KEY');
  },
  get serviceRoleKey() {
    return env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY');
  },
  get initialSuperAdminPhone() {
    return env('INITIAL_SUPER_ADMIN_PHONE');
  },
  get otp() {
    return {
      resendCooldownSeconds: int('OTP_RESEND_COOLDOWN_SECONDS', 45),
      maxSendsPerHour: int('OTP_MAX_SENDS_PER_HOUR', 5),
      maxSendsPerIpPerHour: int('OTP_MAX_SENDS_PER_IP_PER_HOUR', 20),
      maxVerifyAttempts: int('OTP_MAX_VERIFY_ATTEMPTS', 5),
      verifyWindowMinutes: int('OTP_VERIFY_WINDOW_MINUTES', 15),
    };
  },
  get razorpay() {
    return { keyId: env('RAZORPAY_KEY_ID'), keySecret: env('RAZORPAY_KEY_SECRET'), webhookSecret: env('RAZORPAY_WEBHOOK_SECRET') };
  },
  get email() {
    return { resendApiKey: env('RESEND_API_KEY'), from: env('EMAIL_FROM'), adminTo: env('ADMIN_NOTIFICATION_EMAIL') };
  },
  get whatsapp() {
    return { token: env('WHATSAPP_ACCESS_TOKEN'), phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID'), template: env('WHATSAPP_TEMPLATE_NAME'), lang: env('WHATSAPP_TEMPLATE_LANG') || 'en' };
  },
};

export const isSupabaseConfigured = () =>
  /^https:\/\/.+/.test(config.supabaseUrl) && !config.supabaseUrl.includes('YOUR-PROJECT') && config.supabaseAnonKey.length > 20;
export const isServiceRoleConfigured = () => config.serviceRoleKey.length > 20;
export const isRazorpayConfigured = () => Boolean(config.razorpay.keyId && config.razorpay.keySecret);
