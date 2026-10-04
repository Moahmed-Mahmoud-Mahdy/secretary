'use client';

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { endpoints, apiErrorMessage, isAuthError, type UserDTO } from '@/lib/sekretir/api';

interface AuthScreenProps {
  onAuthed: (user: UserDTO) => void;
}

export function AuthScreen({ onAuthed }: AuthScreenProps) {
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'login' | 'register' | 'demo' | null>(null);

  async function handleLogin(email: string, password: string, mode: 'login' | 'demo') {
    setError(null);
    setBusy(mode);
    try {
      const { user } = await endpoints.login(email, password);
      onAuthed(user);
    } catch (e) {
      if (!isAuthError(e)) setError(apiErrorMessage(e));
      else setError(apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleRegister() {
    setError(null);
    if (!regName.trim() || !regEmail.trim() || !regPassword.trim()) {
      setError('اكتب اسمك وإيميلك والباسورد الأول 🙂');
      return;
    }
    setBusy('register');
    try {
      const { user } = await endpoints.register(regName.trim(), regEmail.trim(), regPassword);
      onAuthed(user);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-6">
          <img
            src="/logo.png"
            alt="لوجو سكرتير"
            className="w-20 h-20 rounded-full shadow-md ring-4 ring-amber-100 object-cover"
          />
          <h1 className="text-3xl font-extrabold text-stone-900">سكرتير</h1>
          <p className="text-stone-500 text-sm">مساعدك الشخصي الذكي 🤖</p>
        </div>

        <Card className="bg-white border border-stone-200 rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <Tabs defaultValue="login" dir="rtl">
              <TabsList className="grid grid-cols-2 w-full mb-5">
                <TabsTrigger value="login" className="data-[state=active]:text-amber-700">
                  تسجيل الدخول
                </TabsTrigger>
                <TabsTrigger value="register" className="data-[state=active]:text-amber-700">
                  حساب جديد
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">الإيميل</Label>
                  <Input
                    id="login-email"
                    type="email"
                    dir="ltr"
                    placeholder="you@example.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleLogin(loginEmail.trim(), loginPassword, 'login');
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">الباسورد</Label>
                  <Input
                    id="login-password"
                    type="password"
                    dir="ltr"
                    placeholder="••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleLogin(loginEmail.trim(), loginPassword, 'login');
                    }}
                  />
                </div>
                <Button
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={busy !== null}
                  onClick={() => handleLogin(loginEmail.trim(), loginPassword, 'login')}
                >
                  {busy === 'login' ? <Loader2 className="size-4 animate-spin" /> : null}
                  دخول
                </Button>
              </TabsContent>

              <TabsContent value="register" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-name">اسمك</Label>
                  <Input
                    id="reg-name"
                    placeholder="مثلاً: مهدي"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-email">الإيميل</Label>
                  <Input
                    id="reg-email"
                    type="email"
                    dir="ltr"
                    placeholder="you@example.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password">الباسورد</Label>
                  <Input
                    id="reg-password"
                    type="password"
                    dir="ltr"
                    placeholder="6 حروف على الأقل"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={busy !== null}
                  onClick={handleRegister}
                >
                  {busy === 'register' ? <Loader2 className="size-4 animate-spin" /> : null}
                  اعمل حسابي
                </Button>
              </TabsContent>
            </Tabs>

            {error ? (
              <p className="mt-4 text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 text-center">
                {error}
              </p>
            ) : null}

            <div className="mt-5 pt-5 border-t border-stone-100">
              <Button
                variant="outline"
                className="w-full border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                disabled={busy !== null}
                onClick={() => handleLogin('demo@sekretir.app', '123456', 'demo')}
              >
                {busy === 'demo' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                تجربة سريعة (حساب ديمو)
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-stone-400 mt-6">
          سكرتير بيتكلم مصري ويفهمك — جرب قوله «دفعت 50 جنيه مواصلات» 🚀
        </p>
      </div>
    </div>
  );
}
