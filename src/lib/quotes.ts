// Fortune-cookie fuel for the lucky-charm button. Pure data — no React, no network.

export type Quote = {
  text: string;
  author: string;
  kind: "trading" | "life";
};

export const QUOTES: Quote[] = [
  // --- Trading ---
  {
    text: "The goal of a successful trader is to make the best trades. Money is secondary.",
    author: "Alexander Elder",
    kind: "trading",
  },
  {
    text: "The market can remain irrational longer than you can remain solvent.",
    author: "John Maynard Keynes",
    kind: "trading",
  },
  {
    text: "Amateurs think about how much money they can make. Professionals think about how much money they could lose.",
    author: "Jack Schwager",
    kind: "trading",
  },
  {
    text: "In trading, you have to be defensive and aggressive at the same time. If you are not aggressive, you are not going to make money, and if you are not defensive, you are not going to keep money.",
    author: "Ray Dalio",
    kind: "trading",
  },
  {
    text: "The elements of good trading are: cutting losses, cutting losses, and cutting losses.",
    author: "Ed Seykota",
    kind: "trading",
  },
  {
    text: "It's not whether you're right or wrong that's important, but how much money you make when you're right and how much you lose when you're wrong.",
    author: "George Soros",
    kind: "trading",
  },
  {
    text: "Do more of what works and less of what doesn't.",
    author: "Steve Clark",
    kind: "trading",
  },
  {
    text: "The four most dangerous words in investing are: 'this time it's different.'",
    author: "Sir John Templeton",
    kind: "trading",
  },
  {
    text: "Losers average losers.",
    author: "Paul Tudor Jones",
    kind: "trading",
  },
  {
    text: "The market is a device for transferring money from the impatient to the patient.",
    author: "Warren Buffett",
    kind: "trading",
  },
  {
    text: "Risk comes from not knowing what you're doing.",
    author: "Warren Buffett",
    kind: "trading",
  },
  {
    text: "Every trader has strengths and weaknesses. Some are good holders of winners, but may hold their losers too long. Others may cut their winners too soon, but are quick to take their losses. As long as you stick to your own style, you get the good and the bad in your own approach.",
    author: "Michael Marcus",
    kind: "trading",
  },
  {
    text: "I'm always thinking about losing money as opposed to making money.",
    author: "Paul Tudor Jones",
    kind: "trading",
  },
  {
    text: "The most important rule of trading is to play great defense, not great offense.",
    author: "Paul Tudor Jones",
    kind: "trading",
  },
  {
    text: "There is a time to go long, a time to go short, and a time to go fishing.",
    author: "Jesse Livermore",
    kind: "trading",
  },
  {
    text: "The desire for constant action irrespective of underlying conditions is responsible for many losses on Wall Street.",
    author: "Jesse Livermore",
    kind: "trading",
  },
  {
    text: "Money is made by sitting, not trading.",
    author: "Jesse Livermore",
    kind: "trading",
  },
  {
    text: "Confidence is not 'I will profit on this trade.' Confidence is 'I will be fine if I don't profit on this trade.'",
    author: "Yvan Byeajee",
    kind: "trading",
  },
  {
    text: "You will never find fulfillment trading if you cannot appreciate the small wins.",
    author: "Yvan Byeajee",
    kind: "trading",
  },
  {
    text: "The stock market is a giant distraction from the business of investing.",
    author: "John Bogle",
    kind: "trading",
  },

  // --- Life ---
  {
    text: "The best time to plant a tree was 20 years ago. The second best time is now.",
    author: "Proverb",
    kind: "life",
  },
  {
    text: "It does not matter how slowly you go as long as you do not stop.",
    author: "Confucius",
    kind: "life",
  },
  {
    text: "We suffer more often in imagination than in reality.",
    author: "Seneca",
    kind: "life",
  },
  {
    text: "You have power over your mind — not outside events. Realize this, and you will find strength.",
    author: "Marcus Aurelius",
    kind: "life",
  },
  {
    text: "The impediment to action advances action. What stands in the way becomes the way.",
    author: "Marcus Aurelius",
    kind: "life",
  },
  {
    text: "Luck is what happens when preparation meets opportunity.",
    author: "Seneca",
    kind: "life",
  },
  {
    text: "Fall seven times, stand up eight.",
    author: "Japanese proverb",
    kind: "life",
  },
  {
    text: "He who has a why to live can bear almost any how.",
    author: "Friedrich Nietzsche",
    kind: "life",
  },
  {
    text: "Discipline is choosing between what you want now and what you want most.",
    author: "Abraham Lincoln",
    kind: "life",
  },
  {
    text: "The obstacle is the path.",
    author: "Zen proverb",
    kind: "life",
  },
  {
    text: "Comparison is the thief of joy.",
    author: "Theodore Roosevelt",
    kind: "life",
  },
  {
    text: "What we fear doing most is usually what we most need to do.",
    author: "Ralph Waldo Emerson",
    kind: "life",
  },
  {
    text: "Do not wait; the time will never be 'just right.' Start where you stand.",
    author: "Napoleon Hill",
    kind: "life",
  },
  {
    text: "The mind is everything. What you think you become.",
    author: "Buddha",
    kind: "life",
  },
  {
    text: "Patience is bitter, but its fruit is sweet.",
    author: "Aristotle",
    kind: "life",
  },
];

const pick = (): Quote => QUOTES[Math.floor(Math.random() * QUOTES.length)]!;

/** A random quote, optionally different from the one currently shown. */
export function randomQuote(exclude?: Quote): Quote {
  if (QUOTES.length <= 1) return QUOTES[0]!;
  let q = pick();
  while (exclude && q.text === exclude.text) q = pick();
  return q;
}
