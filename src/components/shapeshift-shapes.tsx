"use client";

import { type ReactNode, type SVGProps, useEffect, useState } from "react";
import { type Shape, shape } from "@/components/shapeshift";

// Eight shapes to start from, and to take apart. Each is three things: the words it answers to (`match`), a reader
// that turns the sentence into its data (`read`), and a component the data fills in (`render`). Keep the ones you
// want, delete the rest, and write your own the same way. Nothing here needs a library or a model.

/* ---------- reading helpers ---------- */

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const clean = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NUMBER = /\d[\d,]*(?:\.\d+)?k?/i;
/** "2,400", "2.4k", "12.50" */
const toNumber = (s: string) => parseFloat(s.replace(/,/g, "")) * (/k$/i.test(s) ? 1000 : 1);
/** Whole numbers stay whole; anything else shows its cents: "800", "22.50". */
const money = (n: number, symbol = "") => symbol + n.toLocaleString("en-US", Number.isInteger(n) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const symbolIn = (text: string) => {
  const found = text.match(/[₹$€£]|\brs\.?(?=\s|\d)/i)?.[0];
  return !found ? "" : /rs/i.test(found) ? "₹" : found;
};

const WEEK = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY = /\b(today|tonight|tomorrow|tmrw|(?:next\s+)?(?:sun|mon|tue(?:s)?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?)(?:day)?)\b/i;
const TIME = /\b(?:(\d{1,2})(?::(\d{2}))?\s*(am|pm)|(\d{1,2}):(\d{2})|(noon|midnight))\b/i;

/** A day, a time or both, out of a sentence: "friday 8pm", "tomorrow", "tonight", "14:30". */
function readWhen(text: string, now = new Date()) {
  const day = text.match(DAY);
  const time = text.match(TIME);
  if (!day && !time) return null;
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const word = day?.[1].toLowerCase() ?? "";
  if (word === "tomorrow" || word === "tmrw") date.setDate(date.getDate() + 1);
  else if (day && word !== "today" && word !== "tonight") {
    // the coming one; "next friday" is the one after
    const ahead = (WEEK.indexOf(word.replace(/^next\s+/, "").slice(0, 3)) - date.getDay() + 7) % 7 || 7;
    date.setDate(date.getDate() + ahead + (word.startsWith("next") ? 7 : 0));
  }
  if (time?.[6]) date.setHours(time[6].toLowerCase() === "noon" ? 12 : 0, 0);
  else if (time) {
    const half = time[3]?.toLowerCase();
    const hours = Number(time[1] ?? time[4]) % (half ? 12 : 24);
    date.setHours(hours + (half === "pm" ? 12 : 0), Number(time[2] ?? time[5] ?? 0));
    // a time alone that has already gone by means tomorrow
    if (!day && date < now) date.setDate(date.getDate() + 1);
  } else if (word === "tonight") date.setHours(20, 0);
  return { date, timed: Boolean(time) || word === "tonight", said: [day?.[0], time?.[0]].filter((s): s is string => Boolean(s)) };
}

/* ---------- shared looks ---------- */

// The panel sits 12px inside the shell's 20px corners, so everything in it has 8px corners, and 6px one step in.
// Nothing here is filled with the primary color: the one loud button is the field's own ("Add event").
const quiet =
  "inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[8px] bg-popover-foreground/[0.06] px-3 text-[13px] outline-none transition-[background-color,scale] duration-150 hover:bg-popover-foreground/[0.1] focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] disabled:cursor-default disabled:opacity-40";
const chip = "inline-flex h-6 max-w-full items-center gap-1 rounded-[6px] bg-muted px-2 text-[12px] whitespace-nowrap tabular-nums";
const heading = "truncate text-[15px] font-medium";
const figure = "text-[30px] leading-none font-medium tracking-[-0.02em] tabular-nums";
const faint = "text-[12px] text-muted-foreground";
const field =
  "h-9 w-full rounded-[8px] bg-muted px-3 text-[16px] outline-none transition-shadow duration-150 placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring sm:text-[14px]";

/** Copies its text and says so for a moment. The two icons trade places with a blur, never a jump. */
function Copy({ text, children, className = quiet }: { text: string; children?: ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const back = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(back);
  }, [copied]);
  const face = "absolute inset-0 transition-[opacity,scale,filter] duration-200 ease-out";
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : `Copy ${text}`}
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {});
        setCopied(true);
      }}
      className={className}
    >
      <span className="relative size-[15px] shrink-0">
        <CopyIcon size={15} className={`${face} ${copied ? "scale-50 opacity-0 blur-[3px]" : ""}`} />
        <CheckIcon size={15} className={`${face} ${copied ? "" : "scale-50 opacity-0 blur-[3px]"}`} />
      </span>
      {children}
    </button>
  );
}

/* ---------- event: "dinner with priya friday 8pm" ---------- */

type Event = { title: string; date: Date; timed: boolean; people: string[]; where?: string };

function readEvent(text: string): Event | null {
  const when = readWhen(text);
  if (!when) return null;
  // take the day and the time out of the sentence, with the "on" or "at" in front of them
  let rest = text;
  for (const said of when.said) rest = rest.replace(new RegExp(`(?:\\b(?:on|at|this)\\s+)?${escape(said)}`, "i"), " ");
  const call = rest.match(/\b(?:on|over|via)\s+(zoom|google meet|meet|teams|facetime|discord|phone)\b/i);
  if (call) rest = rest.replace(call[0], " ");
  // "with priya and rahul" is the company, and the rest is what it's called
  const company = rest.match(/\bwith\s+(?!the\b|my\b|our\b|a\b|an\b|some\b)([a-z][a-z'’-]*(?:(?:\s*,\s*|\s+and\s+|\s*&\s*)[a-z][a-z'’-]*)*)/i);
  if (company) rest = rest.replace(company[0], " ");
  const people = (company?.[1] ?? "").split(/\s*,\s*|\s+and\s+|\s*&\s*/i).filter(Boolean).map(cap);
  return { title: cap(clean(rest)) || "Event", date: when.date, timed: when.timed, people, where: call ? cap(call[1]) : undefined };
}

const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const month = new Intl.DateTimeFormat("en-US", { month: "short" });
const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const stamp = (d: Date, timed: boolean) => {
  const two = (n: number) => String(n).padStart(2, "0");
  const day = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}`;
  return timed ? `${day}T${two(d.getHours())}${two(d.getMinutes())}00` : day;
};

function EventCard({ title, date, timed, people, where }: Event) {
  // an hour long, or the whole day
  const end = new Date(date.getTime() + (timed ? 3600_000 : 86400_000));
  const calendar = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${stamp(date, timed)}/${stamp(end, timed)}${where ? `&location=${encodeURIComponent(where)}` : ""}`;
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-[52px] shrink-0 flex-col items-center justify-center gap-1 rounded-[8px] bg-muted">
        <span className="text-[10px] leading-none font-medium tracking-wide text-muted-foreground uppercase">{month.format(date)}</span>
        <span className="text-[20px] leading-none font-medium tabular-nums">{date.getDate()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className={heading}>{title}</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <span className={chip}>
            <ClockIcon size={13} />
            {weekday.format(date)}, {timed ? clock.format(date) : "all day"}
          </span>
          {where && (
            <span className={chip}>
              <VideoIcon size={13} />
              {where}
            </span>
          )}
          {people.map((person) => (
            <span key={person} className={chip}>
              <span className="-ms-0.5 flex size-4 items-center justify-center rounded-full bg-popover-foreground/[0.12] text-[9px] font-medium">{person[0]}</span>
              {person}
            </span>
          ))}
          <a href={calendar} target="_blank" rel="noreferrer" className={`${chip} bg-transparent text-muted-foreground outline-none transition-colors duration-150 hover:text-popover-foreground focus-visible:ring-2 focus-visible:ring-ring`}>
            Google Calendar
            <ArrowUpRightIcon size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}

export const event = shape({
  id: "event",
  label: "Event",
  hint: "A day and a time, ready for your calendar.",
  example: "dinner with priya friday 8pm",
  action: "Add event",
  icon: <CalendarIcon />,
  match: ["dinner", "lunch", "breakfast", "brunch", "coffee", "drinks", "meeting", "meet", "call", "sync", "standup", "party", "interview", "appointment", "catch up"],
  read: readEvent,
  render: ({ data }) => <EventCard {...data} />,
});

/* ---------- message: "hi, i'm sam, sam@site.com, love the pond" ---------- */

type Message = { name: string; email: string; message: string };

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]*[a-z]/i;
const NAME = /\b(?:i['’]?m|i am|this is|my name is|it['’]?s)\s+([a-z][a-z'’-]*)/i;
const GREETING = /^\s*(hi|hey|hello|yo|hiya)\b/i;
/** Words that follow "I'm" without being anyone's name. */
const NOT_A_NAME = /^(a|an|the|so|very|really|not|just|here|looking|interested|building|trying|working|going|happy|glad|sorry|from)$/i;

function readMessage(text: string): Message | null {
  const email = text.match(EMAIL)?.[0] ?? "";
  const said = text.match(NAME)?.[1] ?? "";
  const name = NOT_A_NAME.test(said) ? "" : cap(said);
  if (!email && !name && !GREETING.test(text)) return null;
  // what follows the first comma is the note, leaving out the address and any part that only says who it is
  const parts = (email ? text.replace(email, " ") : text).split(",").slice(1);
  const message = clean(parts.filter((part) => clean(part.replace(NAME, ""))).join(", "));
  return { name, email, message };
}

function MessageCard({ data, send }: { data: Message; send: (message: Message) => void }) {
  // the sentence fills the form in, until a field is typed in directly: then that field is yours
  const [own, setOwn] = useState<Partial<Message>>({});
  const form = { ...data, ...own };
  const set = (name: keyof Message) => (e: { target: { value: string } }) => setOwn((o) => ({ ...o, [name]: e.target.value }));
  return (
    // a form: Enter and the field's Send button submit it, checks and all
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        send(form);
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <input aria-label="Name" placeholder="Name" value={form.name} onChange={set("name")} autoComplete="name" className={field} />
        <input aria-label="Email" placeholder="Email" type="email" required value={form.email} onChange={set("email")} autoComplete="email" className={field} />
      </div>
      <textarea aria-label="Message" placeholder="Message" rows={2} required value={form.message} onChange={set("message")} className={`${field} h-auto resize-none py-2 leading-normal`} />
      {/* lets Enter in a field submit the form */}
      <button type="submit" hidden />
    </form>
  );
}

export const message = shape({
  id: "message",
  label: "Say hi",
  hint: "A form that fills itself in from the sentence.",
  example: "hi, i'm sam, sam@site.com, love the pond",
  action: "Send",
  icon: <MailIcon />,
  match: [GREETING, EMAIL, "message", "contact", "email"],
  read: readMessage,
  render: ({ data, submit }) => <MessageCard data={data} send={submit} />,
  // Send it wherever your messages go.
  onSubmit: () => {},
});

/* ---------- checklist: "buy milk, eggs, bread and coffee" ---------- */

type List = { title: string; items: string[] };

const LIST_VERB = /^\s*(buy|get|grab|pack|bring|todo|to do)\b:?/i;

function readList(text: string): List | null {
  const verb = text.match(LIST_VERB);
  const items = (verb ? text.slice(verb[0].length) : text)
    .split(/\s*,\s*|\s+and\s+|\s*&\s*|\n/i)
    .map(clean)
    .filter(Boolean)
    .map(cap);
  if (items.length < 2) return null;
  const word = verb?.[1].toLowerCase() ?? "";
  return { title: /buy|get|grab/.test(word) ? "To buy" : /pack|bring/.test(word) ? "To pack" : "To do", items };
}

function ListCard({ title, items }: List) {
  // kept by the item's own words, so ticks survive while the sentence is still being typed
  const [done, setDone] = useState<string[]>([]);
  const ticked = items.filter((item) => done.includes(item)).length;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={heading}>{title}</span>
        <span className={`${faint} shrink-0 tabular-nums`}>
          {ticked} of {items.length}
        </span>
      </div>
      <ul className="-mx-1.5 mt-1">
        {items.map((item) => {
          const on = done.includes(item);
          return (
            <li key={item}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => setDone((d) => (on ? d.filter((i) => i !== item) : [...d, item]))}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-[8px] px-1.5 py-1.5 text-left text-[14px] outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={`flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${on ? "border-transparent bg-primary text-primary-foreground" : "border-popover-foreground/25"}`}>
                  <CheckIcon size={12} className={`transition-[opacity,scale] duration-150 ease-out ${on ? "" : "scale-50 opacity-0"}`} />
                </span>
                <span className={`min-w-0 truncate transition-colors duration-150 ${on ? "text-muted-foreground line-through" : ""}`}>{item}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export const list = shape({
  id: "list",
  label: "Checklist",
  hint: "Anything with commas becomes things to tick off.",
  example: "buy milk, eggs, bread and coffee",
  action: "Add list",
  icon: <ChecklistIcon />,
  match: [LIST_VERB, (text) => (text.match(/,/g)?.length ?? 0) >= 2],
  read: readList,
  render: ({ data }) => <ListCard {...data} />,
});

/* ---------- timer: "25 min focus" ---------- */

type Timer = { seconds: number; label: string };

const SPAN = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/i;

function readTimer(text: string): Timer | null {
  let seconds = 0;
  let rest = text;
  // every length in the sentence, added up: "1h 30m"
  for (const [said, amount, unit] of text.matchAll(new RegExp(SPAN, "gi"))) {
    seconds += Number(amount) * { h: 3600, m: 60, s: 1 }[unit[0].toLowerCase() as "h" | "m" | "s"];
    rest = rest.replace(said, " ");
  }
  if (!seconds && /\bpomodoro\b/i.test(text)) seconds = 25 * 60;
  if (seconds < 1 || seconds > 86400) return null;
  return { seconds: Math.round(seconds), label: cap(clean(rest.replace(/\b(timer|countdown|set|start|a|an|for|of|the)\b/gi, " "))) || "Timer" };
}

const digits = (seconds: number) => {
  const two = (n: number) => String(n).padStart(2, "0");
  const [h, m, s] = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60];
  return h ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
};

/** "25 min", "1 hr 30 min", "45 sec" */
const spoken = (seconds: number) => {
  const [h, m, sec] = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60];
  return [h && `${h} hr`, m && `${m} min`, sec && `${sec} sec`].filter(Boolean).join(" ");
};

const RING = 2 * Math.PI * 34;

function TimerCard({ seconds, label }: Timer) {
  const [left, setLeft] = useState(seconds);
  // when it runs out, by the clock, so a sleeping tab doesn't fall behind
  const [ends, setEnds] = useState<number | null>(null);
  useEffect(() => {
    if (ends === null) return;
    const tick = setInterval(() => {
      const now = Math.max(0, Math.round((ends - Date.now()) / 1000));
      setLeft(now);
      if (now === 0) setEnds(null);
    }, 250);
    return () => clearInterval(tick);
  }, [ends]);
  const running = ends !== null;
  return (
    // on a narrow field the buttons drop under the ring rather than squeeze its label
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
      {/* the ring empties as the time goes */}
      <div className="relative size-[76px] shrink-0">
        <svg viewBox="0 0 76 76" fill="none" strokeWidth="4" aria-hidden className="size-full -rotate-90">
          <circle cx="38" cy="38" r="34" className="stroke-muted" />
          <circle cx="38" cy="38" r="34" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={RING * (1 - left / seconds)} className="stroke-primary transition-[stroke-dashoffset] duration-300 ease-linear" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[15px] font-medium tabular-nums">{digits(left)}</span>
      </div>
      <div className="min-w-[6rem] flex-1">
        <div className={heading}>{left === 0 ? "Time's up" : label}</div>
        <div className={`${faint} mt-0.5 whitespace-nowrap`}>{spoken(seconds)}</div>
      </div>
      <div className="ms-auto flex shrink-0 gap-1.5">
        <button
          type="button"
          aria-label="Reset"
          disabled={left === seconds && !running}
          onClick={() => {
            setEnds(null);
            setLeft(seconds);
          }}
          className={`${quiet} w-8 px-0`}
        >
          <ResetIcon size={16} />
        </button>
        <button type="button" disabled={left === 0} onClick={() => setEnds(running ? null : Date.now() + left * 1000)} className={`${quiet} w-[86px]`}>
          {running ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
          {running ? "Pause" : left < seconds ? "Go on" : "Start"}
        </button>
      </div>
    </div>
  );
}

export const timer = shape({
  id: "timer",
  label: "Timer",
  hint: "Any length of time starts counting down.",
  example: "25 min focus",
  action: "Add timer",
  icon: <TimerIcon />,
  match: ["timer", "pomodoro", "countdown", SPAN],
  read: readTimer,
  // a new length is a new timer
  render: ({ data }) => <TimerCard key={data.seconds} {...data} />,
});

/* ---------- split: "split 2400 between 3" ---------- */

type Split = { total: number; people: number; symbol: string };

const COUNT: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const PARTY = new RegExp(`\\b(?:between|among|amongst|by|with|for)\\s+(\\d+|${Object.keys(COUNT).join("|")})\\b|\\b(\\d+)\\s*(?:people|ways|friends|of us)\\b`, "i");

function readSplit(text: string): Split | null {
  const party = text.match(PARTY);
  const said = party?.[1]?.toLowerCase() ?? party?.[2];
  // two of you, until the sentence says otherwise
  const people = said ? (COUNT[said] ?? Number(said)) : 2;
  const amount = (party ? text.replace(party[0], " ") : text).match(NUMBER)?.[0];
  const total = amount ? toNumber(amount) : 0;
  if (!(total > 0) || people < 1 || people > 99) return null;
  return { total, people, symbol: symbolIn(text) };
}

function SplitCard({ total, people: said, symbol }: Split) {
  const [people, setPeople] = useState(said);
  const step = "flex size-[26px] cursor-pointer items-center justify-center rounded-[5px] outline-none transition-[background-color,scale] duration-150 hover:bg-popover-foreground/[0.08] focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] disabled:cursor-default disabled:opacity-40";
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <div className={faint}>Each pays</div>
        <div className={`${figure} mt-1.5`}>{money(total / people, symbol)}</div>
        <div className={`${faint} mt-1.5 tabular-nums`}>of {money(total, symbol)}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className={faint}>People</span>
        {/* a 32px group, 3px in: 26px buttons with 5px corners */}
        <div className="flex items-center gap-0.5 rounded-[8px] bg-popover-foreground/[0.06] p-[3px]">
          <button type="button" aria-label="One fewer" disabled={people <= 1} onClick={() => setPeople((p) => p - 1)} className={step}>
            <MinusIcon size={14} />
          </button>
          <span aria-live="polite" className="min-w-7 text-center text-[13px] font-medium tabular-nums">
            {people}
          </span>
          <button type="button" aria-label="One more" disabled={people >= 99} onClick={() => setPeople((p) => p + 1)} className={step}>
            <PlusIcon size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export const split = shape({
  id: "split",
  label: "Split a bill",
  hint: "An even share for everyone at the table.",
  example: "split 2400 between 3",
  action: "Add split",
  icon: <UsersIcon />,
  match: ["split", "divide"],
  read: readSplit,
  render: ({ data }) => <SplitCard key={`${data.total} ${data.people}`} {...data} />,
});

/* ---------- poll: "pizza or burgers for friday?" ---------- */

type Poll = { question: string; options: string[] };

function readPoll(text: string): Poll | null {
  let body = clean(text.replace(/\?+\s*$/, ""));
  let about = "";
  const titled = body.match(/^([^,:]+):\s*(.+)$/);
  if (titled) [about, body] = [titled[1], titled[2]];
  body = body.replace(/^(?:poll|vote|should (?:we|i)|shall we|do we|what about|which(?: one)?)\b[\s,]*(?:(?:get|have|do|go for|go to|pick|choose|order|watch|use|try)\s+)?/i, "");
  const options = body.split(/\s*,\s*|\s+or\s+|\s+vs\.?\s+/i).map(clean).filter(Boolean);
  if (options.length < 2 || options.length > 5) return null;
  // "pizza or burgers for friday": what trails the last option is what the vote is about
  const tail = options[options.length - 1].match(/^(.+?)\s+((?:for|on|at)\s+.+|tonight|today|tomorrow)$/i);
  if (tail) {
    options[options.length - 1] = tail[1];
    about ||= tail[2];
  }
  return { question: about ? `${cap(clean(about))}?` : "Which one?", options: options.map(cap) };
}

function PollCard({ question, options }: Poll) {
  const [choice, setChoice] = useState<string | null>(null);
  return (
    <div role="radiogroup" aria-label={question}>
      <div className={heading}>{question}</div>
      <div className="mt-2 flex flex-col gap-1.5">
        {options.map((option) => {
          const on = choice === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setChoice(on ? null : option)}
              className="flex h-9 cursor-pointer items-center gap-2.5 rounded-[8px] bg-muted px-2.5 text-left text-[14px] outline-none transition-[background-color,scale] duration-150 hover:bg-popover-foreground/[0.09] focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.985]"
            >
              <span className={`flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${on ? "border-transparent bg-primary text-primary-foreground" : "border-popover-foreground/25"}`}>
                <CheckIcon size={12} className={`transition-[opacity,scale] duration-150 ease-out ${on ? "" : "scale-50 opacity-0"}`} />
              </span>
              <span className="min-w-0 truncate">{option}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const poll = shape({
  id: "poll",
  label: "Poll",
  hint: "A question with an or in it becomes a vote.",
  example: "pizza or burgers for friday?",
  action: "Add poll",
  icon: <PollIcon />,
  match: [/\b(or|vs)\b.+\?\s*$/i, "poll", "vote", "pick one"],
  read: readPoll,
  render: ({ data }) => <PollCard {...data} />,
});

/* ---------- color: "#ff6b35", "tiffany blue" ---------- */

type Color = { hex: string; name?: string };

const NAMED: Record<string, string> = {
  red: "#EF4444", crimson: "#DC143C", maroon: "#800000", coral: "#FF7F50", salmon: "#FA8072", orange: "#F97316", amber: "#F59E0B",
  gold: "#FFD700", yellow: "#FACC15", lime: "#84CC16", green: "#22C55E", olive: "#808000", mint: "#98FF98", emerald: "#10B981",
  teal: "#14B8A6", turquoise: "#40E0D0", cyan: "#06B6D4", "sky blue": "#87CEEB", blue: "#3B82F6", navy: "#000080", indigo: "#6366F1",
  violet: "#8B5CF6", purple: "#A855F7", lavender: "#B57EDC", magenta: "#FF00FF", pink: "#EC4899", rose: "#F43F5E", brown: "#8B4513",
  tan: "#D2B48C", beige: "#F5F5DC", cream: "#FFFDD0", white: "#FFFFFF", grey: "#808080", gray: "#808080", black: "#000000",
  "tiffany blue": "#0ABAB5", "minecraft diamond": "#4AEDD9", "ferrari red": "#FF2800", "barbie pink": "#E0218A",
};
/** A color's name with the words around it left out: "the color of coral" is "coral". */
const colorName = (text: string) => clean(text.toLowerCase().replace(/\b(colou?r|shade|hue|of|the|a|like)\b/g, " "));

function readColor(text: string): Color | null {
  const hex = text.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/i)?.[1];
  if (hex) return { hex: `#${(hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex).toUpperCase()}` };
  const rgb = text.match(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i);
  if (rgb) return { hex: `#${rgb.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("").toUpperCase()}` };
  const name = colorName(text);
  return NAMED[name] ? { hex: NAMED[name], name: cap(name) } : null;
}

function formats(hex: string) {
  const [r, g, b] = channels(hex);
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const [max, min] = [Math.max(R, G, B), Math.min(R, G, B)];
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { hex, rgb: `rgb(${r}, ${g}, ${b})`, hsl: `hsl(${Math.round((h * 60 + 360) % 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)` };
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** The named color closest to this one, for a hex that came without a name. */
function nearest(hex: string) {
  const [r, g, b] = channels(hex);
  const far = (other: string) => channels(other).reduce((sum, c, i) => sum + (c - [r, g, b][i]) ** 2, 0);
  return Object.keys(NAMED).reduce((best, name) => (far(NAMED[name]) < far(NAMED[best]) ? name : best));
}

/** The color mixed toward white (above 0) or black (below), for the row of shades. */
function shade(hex: string, amount: number) {
  const toward = amount > 0 ? 255 : 0;
  const mix = channels(hex).map((c) => Math.round(c * (1 - Math.abs(amount)) + toward * Math.abs(amount)));
  return `#${mix.map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function ColorCard({ hex, name, pick }: Color & { pick: (hex: string) => void }) {
  const all = formats(hex);
  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="size-[52px] shrink-0 rounded-[8px] ring-1 ring-border transition-colors duration-200 ring-inset" style={{ backgroundColor: hex }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={heading}>{name ?? `Near ${nearest(hex)}`}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[all.hex, all.rgb, all.hsl].map((value) => (
              <Copy key={value} text={value} className={`${chip} cursor-pointer outline-none transition-colors duration-150 hover:bg-popover-foreground/[0.09] focus-visible:ring-2 focus-visible:ring-ring`}>
                <span className="truncate">{value}</span>
              </Copy>
            ))}
          </div>
        </div>
      </div>
      {/* lighter to darker. Picking one rewrites the sentence, and the card reads it back */}
      <div className="mt-3 flex gap-1.5">
        {[0.7, 0.4, 0, -0.25, -0.5].map((amount) => {
          const value = shade(hex, amount);
          return (
            <button
              key={amount}
              type="button"
              aria-label={`Use ${value}`}
              title={value}
              disabled={amount === 0}
              onClick={() => pick(value)}
              className="h-7 flex-1 cursor-pointer rounded-[6px] ring-1 ring-border outline-none transition-[background-color,scale] duration-200 ring-inset focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] disabled:cursor-default"
              style={{ backgroundColor: value }}
            />
          );
        })}
      </div>
    </div>
  );
}

export const color = shape({
  id: "color",
  label: "Color",
  hint: "A hex, an rgb or a name, in every format.",
  example: "tiffany blue",
  action: "Save color",
  icon: <DropIcon />,
  // a hex still being typed counts, so the swatch holds while the last digits arrive
  match: [/#[0-9a-f]{1,6}\b/i, /\brgba?\(/i, (text) => colorName(text) in NAMED],
  read: readColor,
  render: ({ data, setText }) => <ColorCard {...data} pick={setText} />,
});

/* ---------- calculate: "18% of 3450", "12 * (4 + 3)" ---------- */

type Sum = { expression: string; result: number };

/** Sums by hand, no eval: + - * / ^, brackets and a leading minus. */
function work(sum: string): number | null {
  let at = 0;
  const skip = () => {
    while (sum[at] === " ") at++;
  };
  const eat = (sign: string) => {
    skip();
    if (sum[at] !== sign) return false;
    at++;
    return true;
  };
  const atom = (): number => {
    if (eat("(")) {
      const inside = add();
      if (!eat(")")) throw new Error("unclosed");
      return inside;
    }
    if (eat("-")) return -atom();
    const number = /^(\d+\.?\d*|\.\d+)/.exec(sum.slice(at));
    if (!number) throw new Error("not a number");
    at += number[0].length;
    return Number(number[0]);
  };
  const power = (): number => {
    const base = atom();
    return eat("^") ? base ** power() : base;
  };
  const times = (): number => {
    let value = power();
    for (;;) {
      if (eat("*")) value *= power();
      else if (eat("/")) value /= power();
      else return value;
    }
  };
  const add = (): number => {
    let value = times();
    for (;;) {
      if (eat("+")) value += times();
      else if (eat("-")) value -= times();
      else return value;
    }
  };
  try {
    const value = add();
    skip();
    return at === sum.length && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

const PERCENT = /(\d+(?:\.\d+)?)\s*%\s*(of|off)\s*[₹$€£]?\s*(\d[\d,]*(?:\.\d+)?k?)/i;
const SUMS = /^[\d\s+\-*/x×÷^().,]*\d\s*[+\-*/x×÷^][\d\s+\-*/x×÷^().,]*$/i;
const asked = (text: string) => text.replace(/^\s*(what'?s|what is|calculate|calc|compute)\b/i, "").replace(/[=?\s]+$/, "").trim();

function readSum(text: string): Sum | null {
  const percent = text.match(PERCENT);
  if (percent) {
    const [share, of] = [Number(percent[1]), toNumber(percent[3])];
    const off = percent[2].toLowerCase() === "off";
    return { expression: `${percent[1]}% ${off ? "off" : "of"} ${money(of)}`, result: off ? of - (of * share) / 100 : (of * share) / 100 };
  }
  const sum = asked(text);
  if (!SUMS.test(sum)) return null;
  const result = work(sum.replace(/,(?=\d{3})/g, "").replace(/[x×]/gi, "*").replace(/÷/g, "/"));
  return result === null ? null : { expression: sum.replace(/\s+/g, " "), result };
}

function SumCard({ expression, result }: Sum) {
  const answer = (Math.round(result * 1e6) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 });
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <div className={`${faint} truncate tabular-nums`}>{expression} =</div>
        <div className={`${figure} mt-1.5 truncate`}>{answer}</div>
      </div>
      <Copy text={answer} className={`${quiet} shrink-0`}>
        Copy
      </Copy>
    </div>
  );
}

export const sum = shape({
  id: "sum",
  label: "Calculate",
  hint: "Sums and percentages, worked out as you type.",
  example: "18% of 3450",
  action: "Save",
  icon: <CalculatorIcon />,
  // sums still being typed count, so the answer holds while the next number arrives
  match: [/\d\s*%\s*(of|off)\b/i, (text) => SUMS.test(asked(text))],
  read: readSum,
  render: ({ data }) => <SumCard {...data} />,
});

/** Every starter shape. Earlier ones win when a sentence could be two things, so the checklist, which takes anything with commas, goes last. */
export const shapes: Shape[] = [event, message, timer, split, poll, color, sum, list];

/* ---------- icons: 18px grid, round, one tone. Any icon set works in their place. ---------- */

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

function Icon({ size = 18, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="currentColor" aria-hidden {...props}>
      {children}
    </svg>
  );
}

const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const puff = { stroke: "currentColor", strokeWidth: 1.25, strokeLinejoin: "round" } as const;

function CalendarIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect {...line} x="3.2" y="4.3" width="11.6" height="10.4" rx="2.4" />
      <path {...line} d="M3.6 7.7h10.8M6.4 2.9v2.6M11.6 2.9v2.6" />
      <circle cx="6.6" cy="10.6" r="1" />
      <circle cx="9" cy="10.6" r="1" />
    </Icon>
  );
}

function MailIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect {...line} x="3" y="4.4" width="12" height="9.2" rx="2.2" />
      <path {...line} d="M3.9 5.7L9 9.4l5.1-3.7" />
    </Icon>
  );
}

function ChecklistIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path {...line} d="M3.3 5.5l1.25 1.25 2.3-2.5M9.4 5.6h5.3M9.4 12.2h5.3" />
      <circle {...line} cx="4.9" cy="12.2" r="1.7" />
    </Icon>
  );
}

function TimerIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle {...line} cx="9" cy="10.2" r="5.1" />
      <path {...line} d="M9 10.2V7.5M7.4 2.9h3.2" />
    </Icon>
  );
}

function UsersIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle {...puff} cx="5.9" cy="6.5" r="1.8" />
      <circle {...puff} cx="12.1" cy="6.5" r="1.8" />
      <path {...puff} d="M3.75 13.3c.28-1.6 1.05-2.45 2.15-2.45s1.87.85 2.15 2.45c.07.42-.23.8-.66.8H4.41c-.43 0-.73-.38-.66-.8z" />
      <path {...puff} d="M9.95 13.3c.28-1.6 1.05-2.45 2.15-2.45s1.87.85 2.15 2.45c.07.42-.23.8-.66.8h-2.98c-.43 0-.73-.38-.66-.8z" />
    </Icon>
  );
}

function PollIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect {...puff} strokeWidth={1} x="3.6" y="4" width="10.8" height="2.2" rx="1.1" />
      <rect {...puff} strokeWidth={1} x="3.6" y="7.9" width="6.6" height="2.2" rx="1.1" />
      <rect {...puff} strokeWidth={1} x="3.6" y="11.8" width="8.8" height="2.2" rx="1.1" />
    </Icon>
  );
}

function DropIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path {...puff} strokeWidth={1.5} d="M9 3.4c2.3 2.6 3.7 4.6 3.7 6.5a3.7 3.7 0 01-7.4 0c0-1.9 1.4-3.9 3.7-6.5z" />
    </Icon>
  );
}

function CalculatorIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect {...line} x="4" y="2.9" width="10" height="12.2" rx="2.4" />
      <rect {...puff} strokeWidth={1} x="6.4" y="5.2" width="5.2" height="1.8" rx=".6" />
      <circle cx="6.9" cy="10.1" r=".85" />
      <circle cx="9" cy="10.1" r=".85" />
      <circle cx="11.1" cy="10.1" r=".85" />
      <circle cx="6.9" cy="12.6" r=".85" />
      <circle cx="9" cy="12.6" r=".85" />
      <circle cx="11.1" cy="12.6" r=".85" />
    </Icon>
  );
}

function CheckIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path {...line} d="M4.4 9.6l3 3 6.2-6.4" />
    </Icon>
  );
}

function CopyIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path {...puff} d="M5.4 3h3.9a2.5 2.5 0 012.3 1.5H6.6a2.1 2.1 0 00-2.1 2.1v5.1A2.5 2.5 0 013 9.4V5.4A2.4 2.4 0 015.4 3z" />
      <rect {...puff} x="6.6" y="6.6" width="8.4" height="8.4" rx="2.6" />
    </Icon>
  );
}

function PlusIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path {...line} d="M9 4.25v9.5M4.25 9h9.5" />
    </Icon>
  );
}

function MinusIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path {...line} d="M4.25 9h9.5" />
    </Icon>
  );
}

function PlayIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path {...puff} strokeWidth={1.5} d="M6.6 4.9v8.2c0 .58.64.93 1.13.6l6.1-4.1a.72.72 0 000-1.2l-6.1-4.1c-.49-.33-1.13.02-1.13.6z" />
    </Icon>
  );
}

function PauseIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect {...puff} strokeWidth={1.5} x="5" y="4.5" width="2.6" height="9" rx="1" />
      <rect {...puff} strokeWidth={1.5} x="10.4" y="4.5" width="2.6" height="9" rx="1" />
    </Icon>
  );
}

function ClockIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle {...line} cx="9" cy="9" r="5.7" />
      <path {...line} d="M9 6.1V9l1.9 1.3" />
    </Icon>
  );
}

function VideoIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect {...line} x="2.6" y="5" width="8.4" height="8" rx="2.3" />
      <path {...line} d="M11.2 8.3l3.2-1.9c.3-.2.6 0 .6.3v4.6c0 .3-.3.5-.6.3l-3.2-1.9" />
    </Icon>
  );
}

function ResetIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path {...line} d="M4.4 6A5.8 5.8 0 1 1 3.4 9.8M4 2.8v3.5h3.5" />
    </Icon>
  );
}

function ArrowUpRightIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path {...line} d="M5.25 12.75l7.5-7.5M6.75 5.25h6v6" />
    </Icon>
  );
}
