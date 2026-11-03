export const pinterestUrl = (q: string) =>
  `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(q.trim().slice(0, 140))}`;
