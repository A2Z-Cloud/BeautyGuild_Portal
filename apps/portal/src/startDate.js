// Start dates: today by default, up to 30 days ahead. UTC days are used so the picker agrees with the server.
export const START_WINDOW_DAYS=30;
const iso=date=>date.toISOString().slice(0,10);
export const startLimits=(now=Date.now())=>({min:iso(new Date(now)),max:iso(new Date(now+START_WINDOW_DAYS*864e5))});
export const isFuture=(date,now=Date.now())=>Boolean(date)&&String(date).slice(0,10)>iso(new Date(now));
