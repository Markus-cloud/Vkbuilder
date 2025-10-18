import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Settings, BarChart3, FileText, Users, Search } from "lucide-react";

interface VKCity {
  id: number;
  title: string;
}
interface VKUser {
  id: number;
  first_name: string;
  last_name: string;
  bdate?: string;
  city?: { id: number; title: string };
  occupation?: { type?: string; name?: string };
  counters?: { friends?: number };
  online?: number;
  can_send_friend_request?: boolean;
}

function parseAccessTokenFromText(text: string): string | null {
  if (!text) return null;
  const direct = text.trim();
  if (/^[a-z0-9_\-]+$/i.test(direct) && direct.length > 20) return direct;
  try {
    const url = new URL(text);
    const fromQuery = url.searchParams.get("access_token");
    if (fromQuery) return fromQuery;
    if (url.hash) {
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const token = hash.get("access_token");
      if (token) return token;
    }
  } catch {
    const m = text.match(/access_token=([^&#\s]+)/i);
    if (m) return m[1];
  }
  return null;
}

function computeAge(bdate?: string): number | null {
  if (!bdate) return null;
  const parts = bdate.split(".");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map((p) => parseInt(p, 10));
  if (!y || !m || !d) return null;
  const dob = new Date(y, m - 1, d);
  const diff = Date.now() - dob.getTime();
  const age = new Date(diff).getUTCFullYear() - 1970;
  return age;
}

export default function Index() {
  const [tokenInput, setTokenInput] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [tokenOk, setTokenOk] = useState(false);

  const [cityQuery, setCityQuery] = useState("");
  const [cities, setCities] = useState<VKCity[]>([]);
  const [city, setCity] = useState<VKCity | null>(null);

  const [minAge, setMinAge] = useState(18);
  const [profession, setProfession] = useState("");
  const [onlyOnline, setOnlyOnline] = useState(true);

  const [minFriends, setMinFriends] = useState(50);
  const [maxFriends, setMaxFriends] = useState(2000);
  const [requestsPerHour, setRequestsPerHour] = useState(40);
  const [extraDelayMs, setExtraDelayMs] = useState(2000);

  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);

  const [logs, setLogs] = useState<string[]>([]);
  const logsRef = useRef<HTMLDivElement>(null);

  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthScopes, setOauthScopes] = useState("friends,offline");

  const [sentUserIds, setSentUserIds] = useState<Set<number>>(new Set());

  const [activeSection, setActiveSection] = useState<"token" | "filters" | "settings" | "stats">("token");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("vk_bot_sent_users");
      if (stored) {
        const ids = JSON.parse(stored);
        setSentUserIds(new Set(ids));
        addLog(`Загружено ${ids.length} ранее отправленных заявок`);
      }
    } catch (e) {
      console.error("Failed to load sent user IDs from localStorage:", e);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "vk_bot_sent_users",
        JSON.stringify(Array.from(sentUserIds)),
      );
    } catch (e) {
      console.error("Failed to save sent user IDs to localStorage:", e);
    }
  }, [sentUserIds]);

  useEffect(() => {
    const t = parseAccessTokenFromText(tokenInput);
    if (t) {
      setToken(t);
      setTokenOk(true);
    } else {
      setToken(null);
      setTokenOk(false);
    }
  }, [tokenInput]);

  useEffect(() => {
    if (!logsRef.current) return;
    logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs((l) => [...l, `[${ts}] ${msg}`]);
  }, []);

  const fetchCities = useCallback(
    async (q: string) => {
      if (!token) return setCities([]);
      try {
        const res = await fetch(
          `/api/vk/cities?q=${encodeURIComponent(q)}&country_id=1`,
          {
            headers: { "x-vk-token": token },
          },
        );
        const data = await res.json();
        if (data.items) setCities(data.items as VKCity[]);
      } catch (e: any) {
        addLog(`Ошибка загрузки городов: ${e.message ?? e}`);
      }
    },
    [token, addLog],
  );

  useEffect(() => {
    if (!cityQuery || !token) return;
    const id = setTimeout(() => fetchCities(cityQuery), 300);
    return () => clearTimeout(id);
  }, [cityQuery, token, fetchCities]);

  const popularCities = [
    "Москва",
    "Санкт-Петербург",
    "Новосибирск",
    "Екатеринбург",
    "Нижний Новгород",
    "Казань",
    "Челябинск",
    "Омск",
    "Самара",
    "Ростов-на-Дону",
  ];

  const fetchCityByName = useCallback(
    async (name: string) => {
      if (!token) return;
      try {
        const res = await fetch(
          `/api/vk/cities?q=${encodeURIComponent(name)}&country_id=1`,
          {
            headers: { "x-vk-token": token },
          },
        );
        const data = await res.json();
        if (data.items && data.items.length) {
          setCity(data.items[0] as VKCity);
          addLog(`Город выбран: ${data.items[0].title}`);
        } else {
          addLog(`Город не найден: ${name}`);
        }
      } catch (e: any) {
        addLog(`Ошибка поиска города: ${e.message ?? e}`);
      }
    },
    [token, addLog],
  );

  const effectiveDelay = useMemo(() => {
    const perHourDelay =
      requestsPerHour > 0 ? Math.floor(3600_000 / requestsPerHour) : 0;
    return Math.max(perHourDelay, extraDelayMs);
  }, [requestsPerHour, extraDelayMs]);

  const openOauth = useCallback(() => {
    const id = oauthClientId.trim();
    const scope = oauthScopes.trim() || "friends,offline";
    const redirect = "https://oauth.vk.com/blank.html";
    if (!id) {
      window.open(
        "https://dev.vk.com/ru/api/access-token/implicit-flow-user",
        "_blank",
      );
      return;
    }
    const url = new URL("https://oauth.vk.com/authorize");
    url.searchParams.set("client_id", id);
    url.searchParams.set("display", "page");
    url.searchParams.set("redirect_uri", redirect);
    url.searchParams.set("scope", scope);
    url.searchParams.set("response_type", "token");
    url.searchParams.set("v", "5.199");
    window.open(url.toString(), "_blank");
  }, [oauthClientId, oauthScopes]);

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const t = parseAccessTokenFromText(text);
      if (t) {
        setTokenInput(t);
        addLog("Токен получен из буфера обмена");
      } else {
        setTokenInput(text);
        addLog("Попытка извлечения токена из вставленного текста");
      }
    } catch (e: any) {
      addLog(`Не удалось прочитать буфер обмена: ${e.message ?? e}`);
    }
  }, [addLog]);

  const nextOffsetRef = useRef(0);
  const queueRef = useRef<VKUser[]>([]);
  const [queueState, setQueueState] = useState<VKUser[]>([]);
  const [successCount, setSuccessCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [vkCalls, setVkCalls] = useState(0);

  const fetchBatch = useCallback(
    async (opts?: {
      desired_count?: number;
      max_pages?: number;
      per_page?: number;
    }) => {
      if (!token) return [] as VKUser[];
      const body: any = {
        city_id: city?.id,
        age_from: minAge || undefined,
        q: undefined as string | undefined,
        online: onlyOnline,
        min_friends: minFriends || undefined,
        max_friends: maxFriends || undefined,
        profession: profession || undefined,
        desired_count: opts?.desired_count ?? 50,
        max_pages: opts?.max_pages ?? 8,
        per_page: opts?.per_page ?? 50,
        offset: nextOffsetRef.current,
      };
      try {
        const res = await fetch("/api/vk/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-vk-token": token },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        if (data.meta && typeof data.meta.vk_calls === "number") {
          setVkCalls((v) => v + data.meta.vk_calls);
        }
        const items = (data.items as VKUser[]) || [];
        if (data.meta && typeof data.meta.vk_offset === "number") {
          nextOffsetRef.current = data.meta.vk_offset;
        } else {
          nextOffsetRef.current += items.length;
        }
        addLog(`Найдено кандидатов: ${items.length}`);
        if (data.meta) addLog(`VK calls: ${data.meta.vk_calls ?? 0}`);
        if (data.meta?.raw_samples && data.meta.raw_samples.length > 0) {
          const sample = data.meta.raw_samples[0];
          const reasons = (sample as any)?._rejected_reasons || [];
          if (reasons.length > 0) {
            addLog(
              `🔍 Отклонены: ${sample.first_name} ${sample.last_name} (${reasons.join(", ")})`,
            );
          }
        }
        return items;
      } catch (e: any) {
        addLog(`Ошибка поиска: ${e.message ?? e}`);
        return [] as VKUser[];
      }
    },
    [
      token,
      city?.id,
      minAge,
      onlyOnline,
      minFriends,
      maxFriends,
      profession,
      addLog,
    ],
  );

  const candidatePasses = useCallback(
    (u: VKUser) => {
      if (sentUserIds.has(u.id)) return false;

      const age = computeAge(u.bdate);
      if (minAge && age !== null && age < minAge) return false;
      if (onlyOnline && u.online !== 1) return false;
      const f =
        typeof u.counters?.friends === "number"
          ? u.counters!.friends
          : undefined;
      if (minFriends || maxFriends) {
        if (typeof f === "number") {
          if (minFriends && f < minFriends) return false;
          if (maxFriends && f > maxFriends) return false;
        }
      }
      if (profession.trim()) {
        const p = profession.trim().toLowerCase();
        const occ = (
          u.occupation?.name ||
          u.occupation?.type ||
          ""
        ).toLowerCase();
        if (!occ.includes(p)) return false;
      }
      if (
        u.can_send_friend_request === false ||
        u.can_send_friend_request === 0
      )
        return false;
      return true;
    },
    [minAge, onlyOnline, minFriends, maxFriends, profession, sentUserIds],
  );

  const addFriend = useCallback(
    async (user: VKUser) => {
      if (!token) return false;
      try {
        const res = await fetch("/api/vk/add-friend", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-vk-token": token },
          body: JSON.stringify({ user_id: user.id }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        addLog(
          `Заявка отправлена: ${user.first_name} ${user.last_name} (id${user.id})`,
        );
        setSentUserIds((prev) => new Set([...prev, user.id]));
        setSuccessCount((s) => s + 1);
        return true;
      } catch (e: any) {
        addLog(`Ошибка отправки заявки id${user.id}: ${e.message ?? e}`);
        setErrorCount((s) => s + 1);
        return false;
      }
    },
    [token, addLog],
  );

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const start = useCallback(async () => {
    if (!token) {
      addLog("Укажите корректный токен VK");
      return;
    }
    setSuccessCount(0);
    setErrorCount(0);
    setVkCalls(0);
    setRunning(true);
    runningRef.current = true;
    addLog("Бот запущен");

    const consecutiveEmptyFetches = { current: 0 };

    while (runningRef.current) {
      if (queueRef.current.length < 5) {
        let items: VKUser[] = [];
        if (consecutiveEmptyFetches.current >= 3) {
          addLog(
            "Мало кандидатов — расширяю поиск (временно увеличиваю страницы/количество)",
          );
          items = await fetchBatch({
            desired_count: 100,
            max_pages: 20,
            per_page: 100,
          });
        } else {
          items = await fetchBatch();
        }

        const filtered = items.filter(candidatePasses);
        if (filtered.length > 0) {
          consecutiveEmptyFetches.current = 0;
          queueRef.current.push(...filtered);
          setQueueState([...queueRef.current]);
        } else {
          consecutiveEmptyFetches.current++;
        }
      }

      const user = queueRef.current.shift();
      setQueueState([...queueRef.current]);

      if (!user) {
        addLog("⚠️ Нет подходящих кандидатов. Про��ерьте фильтры:");
        if (city) addLog(`  ✓ Город: ${city.title}`);
        else addLog(`  ⚠️ Город НЕ выбран`);
        if (minAge) addLog(`  ✓ Мин. возраст: ${minAge}+`);
        if (minFriends || maxFriends)
          addLog(`  ✓ Друзья: ${minFriends || 0}-${maxFriends || "∞"}`);
        if (profession) addLog(`  ✓ Профессия: ${profession}`);
        if (onlyOnline) addLog(`  ✓ Только онлайн`);
        await sleep(1500);
        continue;
      }

      await addFriend(user);
      await sleep(effectiveDelay);
    }

    addLog("Бот остановлен");
  }, [token, addLog, fetchBatch, candidatePasses, addFriend, effectiveDelay]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-accent/20 flex">
      {/* Sidebar */}
      <div className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center font-bold text-sm">
              VK
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight text-sidebar-foreground">
                VK Бот
              </h1>
              <p className="text-xs text-sidebar-accent">Автоматизация</p>
            </div>
          </div>
        </div>

        {/* Profile Card */}
        <div className="p-6 border-b border-sidebar-border">
          <div className="bg-sidebar-primary/10 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-12 w-12 rounded-full bg-sidebar-primary/20 flex items-center justify-center">
                <span className="text-lg font-bold text-sidebar-primary">НР</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-sidebar-foreground">Nancy Ramos</p>
                <p className="text-xs text-sidebar-accent">Социальный фотограф</p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="w-full text-xs border-sidebar-primary/30">
              Просмотр профиля
            </Button>
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="flex-1 p-4 space-y-2">
          <button
            onClick={() => setActiveSection("token")}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
              activeSection === "token"
                ? "bg-sidebar-primary/20 text-sidebar-primary"
                : "text-sidebar-foreground hover:bg-sidebar-primary/10"
            )}
          >
            <FileText size={18} />
            Токен
          </button>
          <button
            onClick={() => setActiveSection("filters")}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
              activeSection === "filters"
                ? "bg-sidebar-primary/20 text-sidebar-primary"
                : "text-sidebar-foreground hover:bg-sidebar-primary/10"
            )}
          >
            <Search size={18} />
            Фильтры
          </button>
          <button
            onClick={() => setActiveSection("settings")}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
              activeSection === "settings"
                ? "bg-sidebar-primary/20 text-sidebar-primary"
                : "text-sidebar-foreground hover:bg-sidebar-primary/10"
            )}
          >
            <Settings size={18} />
            Настрой��и
          </button>
          <button
            onClick={() => setActiveSection("stats")}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
              activeSection === "stats"
                ? "bg-sidebar-primary/20 text-sidebar-primary"
                : "text-sidebar-foreground hover:bg-sidebar-primary/10"
            )}
          >
            <BarChart3 size={18} />
            Аналитика
          </button>
        </div>

        {/* Sidebar Footer Stats */}
        <div className="p-4 border-t border-sidebar-border space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-sidebar-foreground/70">Профиль</span>
            <div className="h-1.5 w-24 bg-sidebar-primary/30 rounded-full overflow-hidden">
              <div className="h-full bg-sidebar-primary" style={{ width: "70%" }}></div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sidebar-foreground/70">Изображения</span>
            <div className="h-1.5 w-24 bg-sidebar-primary/30 rounded-full overflow-hidden">
              <div className="h-full bg-sidebar-primary" style={{ width: "45%" }}></div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sidebar-foreground/70">Аналитика</span>
            <div className="h-1.5 w-24 bg-sidebar-primary/30 rounded-full overflow-hidden">
              <div className="h-full bg-sidebar-primary" style={{ width: "60%" }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="bg-card/80 backdrop-blur border-b border-border p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                {activeSection === "token" && "Конфигурация токена"}
                {activeSection === "filters" && "Фильтры поиска"}
                {activeSection === "settings" && "Настройки скорости"}
                {activeSection === "stats" && "Статистика и аналитика"}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Ежедневная цитата: «Фотографируй только то, что ты любишь – Тим Уокер»
              </p>
            </div>
            <Button
              variant="default"
              size="sm"
              className="bg-sidebar-primary hover:bg-sidebar-primary/90"
            >
              Поиск
            </Button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid gap-6 grid-cols-3">
            {/* Left Column - Main Content */}
            <div className="col-span-2 space-y-6">
              {/* Token Section */}
              {activeSection === "token" && (
                <Card className="border-border/50 bg-card/50">
                  <CardHeader>
                    <CardTitle className="text-lg">Токен VK API</CardTitle>
                    <CardDescription>
                      Вставьте ссылку с токеном или сам токен
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Ссылка с токеном или токен</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="https://oauth.vk.com/blank.html#access_token=..."
                          value={tokenInput}
                          onChange={(e) => setTokenInput(e.target.value)}
                          className={cn(tokenOk ? "ring-1 ring-primary/50" : "")}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={pasteFromClipboard}
                          className="whitespace-nowrap"
                        >
                          Вставить
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {tokenOk
                          ? "✓ Токен распознан"
                          : "✗ Токен не распознан"}
                      </p>
                    </div>

                    <Dialog>
                      <DialogTrigger asChild>
                        <Button type="button" variant="outline" className="w-full">
                          Получить токен
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Получить токен (неявный поток)</DialogTitle>
                          <DialogDescription>
                            Введите ID вашего приложения VK, выберите разрешения и откройте страницу авторизации.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <Label>ID клиента</Label>
                            <Input
                              placeholder="1234567"
                              value={oauthClientId}
                              onChange={(e) => setOauthClientId(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Область доступа</Label>
                            <Input
                              placeholder="friends,offline"
                              value={oauthScopes}
                              onChange={(e) => setOauthScopes(e.target.value)}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button onClick={openOauth} className="flex-1">
                              Открыть VK OAuth
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() =>
                                window.open(
                                  "https://dev.vk.com/ru/api/access-token/implicit-flow-user",
                                  "_blank",
                                )
                              }
                            >
                              Документация
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </CardContent>
                </Card>
              )}

              {/* Filters Section */}
              {activeSection === "filters" && (
                <Card className="border-border/50 bg-card/50">
                  <CardHeader>
                    <CardTitle className="text-lg">Фильтры поиска</CardTitle>
                    <CardDescription>
                      Настройте параметры поиска кандидатов
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label>Город</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-between">
                            {city ? city.title : "Выберите город"}
                            <span className="text-muted-foreground">(поиск)</span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0" align="start">
                          <Command>
                            <CommandInput
                              placeholder="Введите название города..."
                              value={cityQuery}
                              onValueChange={setCityQuery}
                            />
                            <CommandList>
                              <CommandEmpty>Город не найден</CommandEmpty>
                              <CommandGroup>
                                {cities.length > 0
                                  ? cities.map((c) => (
                                      <CommandItem
                                        key={c.id}
                                        value={String(c.id)}
                                        onSelect={() => {
                                          addLog(`Город: ${c.title}`);
                                          setCity(c);
                                          setCityQuery("");
                                        }}
                                      >
                                        {c.title}
                                      </CommandItem>
                                    ))
                                  : popularCities.map((name) => (
                                      <CommandItem
                                        key={name}
                                        value={name}
                                        onSelect={() => {
                                          addLog(`Популярный город: ${name}`);
                                          fetchCityByName(name);
                                          setCityQuery("");
                                        }}
                                      >
                                        {name}
                                      </CommandItem>
                                    ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Минимальный возраст: {minAge}+</Label>
                      <Slider
                        value={[minAge]}
                        min={14}
                        max={60}
                        step={1}
                        onValueChange={(v) => setMinAge(v[0])}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Профессия</Label>
                      <Input
                        placeholder="например: дизайнер"
                        value={profession}
                        onChange={(e) => setProfession(e.target.value)}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label>Только онлайн</Label>
                        <p className="text-xs text-muted-foreground">
                          Искать только пользователей в сети
                        </p>
                      </div>
                      <Switch checked={onlyOnline} onCheckedChange={setOnlyOnline} />
                    </div>

                    <div className="space-y-2">
                      <Label>Диапазон друзей</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Минимум</Label>
                          <Input
                            type="number"
                            value={minFriends}
                            onChange={(e) =>
                              setMinFriends(parseInt(e.target.value || "0", 10))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Максимум</Label>
                          <Input
                            type="number"
                            value={maxFriends}
                            onChange={(e) =>
                              setMaxFriends(parseInt(e.target.value || "0", 10))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Settings Section */}
              {activeSection === "settings" && (
                <Card className="border-border/50 bg-card/50">
                  <CardHeader>
                    <CardTitle className="text-lg">Настройки скорости</CardTitle>
                    <CardDescription>
                      Конфигурация ограничения скорости и задержки
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label>Диапазон друзей</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Ми��имум</Label>
                          <Input
                            type="number"
                            value={minFriends}
                            onChange={(e) =>
                              setMinFriends(parseInt(e.target.value || "0", 10))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Максимум</Label>
                          <Input
                            type="number"
                            value={maxFriends}
                            onChange={(e) =>
                              setMaxFriends(parseInt(e.target.value || "0", 10))
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label>Заявок в час</Label>
                      <Input
                        type="number"
                        value={requestsPerHour}
                        onChange={(e) =>
                          setRequestsPerHour(parseInt(e.target.value || "0", 10))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Дополнительная задержка (мс)</Label>
                      <Input
                        type="number"
                        value={extraDelayMs}
                        onChange={(e) =>
                          setExtraDelayMs(parseInt(e.target.value || "0", 10))
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Фактическая задержка: {effectiveDelay} мс
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Stats/Analytics Section */}
              {activeSection === "stats" && (
                <Card className="border-border/50 bg-card/50">
                  <CardHeader>
                    <CardTitle className="text-lg">Аналитика</CardTitle>
                    <CardDescription>
                      Просмотрите детальную статистику и отчеты
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8 text-muted-foreground">
                      <p>Визуализация аналитики будет отображена здесь</p>
                      <p className="text-sm mt-2">��апустите бота для просмотра статистики</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Articles Table Style Card */}
              <Card className="border-border/50 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-sm">НАЗВАНИЕ СТАТЬИ</CardTitle>
                  <CardDescription className="grid grid-cols-5 gap-4 mt-4">
                    <span>РЕЙТИНГ</span>
                    <span>СТАТУС</span>
                    <span>ПРОСМОТРЫ</span>
                    <span>ЦЕНА</span>
                    <span>ДАТА</span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="grid grid-cols-5 gap-4 text-sm py-2 border-b border-border">
                      <div>
                        <div className="font-medium text-foreground">Исследования в рекламе</div>
                      </div>
                      <div>
                        <span className="inline-block w-2 h-2 rounded-full bg-primary mr-2"></span>
                        <span className="text-xs text-muted-foreground">Открыть анализ</span>
                      </div>
                      <div>
                        <div className="w-20 h-1 bg-primary/30 rounded-full"></div>
                      </div>
                      <div className="text-muted-foreground">Детали</div>
                      <div className="text-muted-foreground text-xs">23 августа 2017</div>
                    </div>
                    <div className="grid grid-cols-5 gap-4 text-sm py-2">
                      <div>
                        <div className="font-medium text-foreground">Продажа брошюр</div>
                      </div>
                      <div>
                        <span className="inline-block w-2 h-2 rounded-full bg-muted mr-2"></span>
                        <span className="text-xs text-muted-foreground">Закрыть анализ</span>
                      </div>
                      <div>
                        <div className="w-16 h-1 bg-primary/30 rounded-full"></div>
                      </div>
                      <div className="text-muted-foreground">Детали</div>
                      <div className="text-muted-foreground text-xs">23 августа 2017</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Stats */}
            <div className="space-y-6">
              {/* Control Card */}
              <Card className="border-border/50 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-sm">Управление</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button
                    onClick={start}
                    disabled={running}
                    className="w-full bg-sidebar-primary hover:bg-sidebar-primary/90"
                  >
                    Старт
                  </Button>
                  <Button
                    onClick={stop}
                    variant="outline"
                    disabled={!running}
                    className="w-full"
                  >
                    Стоп
                  </Button>
                </CardContent>
              </Card>

              {/* Stats Cards */}
              <Card className="border-border/50 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-sm">ТЕКУЩИЕ ОЦЕНКИ</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">ОЦЕНКА #1</span>
                      <span className="text-foreground font-semibold">2,775</span>
                    </div>
                    <div className="h-1 bg-primary/30 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: "85%" }}
                      ></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">ОЦЕНКА #2</span>
                      <span className="text-foreground font-semibold">1,380</span>
                    </div>
                    <div className="h-1 bg-primary/30 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: "50%" }}
                      ></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">ОЦЕНКА #3</span>
                      <span className="text-foreground font-semibold">3,089</span>
                    </div>
                    <div className="h-1 bg-primary/30 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: "90%" }}
                      ></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">ОЦЕНКА #4</span>
                      <span className="text-foreground font-semibold">2,377</span>
                    </div>
                    <div className="h-1 bg-primary/30 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: "70%" }}
                      ></div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Statistics */}
              <Card className="border-border/50 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-sm">Статистика</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Успешные заявки</span>
                    <span className="font-semibold text-foreground">{successCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ошибки</span>
                    <span className="font-semibold text-foreground">{errorCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">VK API вызовы</span>
                    <span className="font-semibold text-foreground">{vkCalls}</span>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Всего контактов</span>
                    <span className="font-semibold text-foreground">{sentUserIds.size}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Log */}
              <Card className="border-border/50 bg-card/50 flex flex-col">
                <CardHeader>
                  <CardTitle className="text-sm">Лог</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <div
                    ref={logsRef}
                    className="h-48 overflow-y-auto rounded-md border bg-background px-3 py-2 text-xs font-mono text-muted-foreground flex-1"
                  >
                    {logs.length === 0 ? (
                      <div className="text-muted-foreground">
                        Ожидание активности бота...
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {logs.map((l, i) => (
                          <div key={i} className="text-[10px]">{l}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setLogs([])}
                      className="text-xs h-8"
                    >
                      Очистить
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigator.clipboard.writeText(logs.join("\n"))}
                      className="text-xs h-8"
                    >
                      Копировать
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
