/**
 * All landing page copy in one place. Only claims the product actually delivers:
 * landing.copy.test.ts rejects words that imply features that don't exist.
 */

/** Login CTA target: the `/login` route is handled by the Google auth flow. */
export const LOGIN_HREF = "/login";

/** CTA target for signed-in users: the app area. */
export const APP_HREF = "/app";

/** Section ids used as nav/CTA anchor targets. */
export const SECTION_IDS = {
  top: "top",
  main: "content",
  features: "features",
  how: "how-it-works",
  useCases: "use-cases",
  faq: "faq",
} as const;

/** SEO meta for `/`, set by the router. */
export const LANDING_META = {
  title: "zoomin — compare multiple screens in one meeting",
  description:
    "Self-hosted video meetings: every participant can share several screens at once, and the host arranges one " +
    "stage layout for everyone.",
} as const;

export const NAV = {
  label: "Main navigation",
  links: [
    { href: `#${SECTION_IDS.features}`, label: "Features" },
    { href: `#${SECTION_IDS.how}`, label: "How it works" },
    { href: `#${SECTION_IDS.useCases}`, label: "Use cases" },
    { href: `#${SECTION_IDS.faq}`, label: "FAQ" },
  ],
  login: "Sign in",
  app: "Open app",
  skip: "Skip to content",
} as const;

export const HERO = {
  eyebrow: "Self-hosted meetings for side-by-side review",
  titleLead: "Screens A, B, and C.",
  titleRest: "Side by side, for everyone.",
  sub:
    "Every participant can share more than one screen. The host arranges the stage — side by side, grid, or " +
    "focus — and everyone sees the same layout. Runs on your own server.",
  ctaLogin: "Sign in with Google",
  ctaApp: "Open app",
  ctaHow: "See how it works",
  points: ["Multiple screens per participant", "Host-controlled layout", "Your data on your server"],
} as const;

/** Hero stage mockup copy (decorative, but its template buttons work). */
export const MOCKUP = {
  label: "Sample zoomin stage with three shared screens",
  room: "Checkout design review",
  templatesLabel: "Try a layout template",
  templates: [
    { id: "side", label: "Side by side" },
    { id: "grid", label: "Grid" },
    { id: "focus", label: "Focus" },
  ],
  hostNote: "Set by the host · same for everyone",
  screens: [
    { tag: "A", owner: "Rina · Screen 1", title: "Checkout v1" },
    { tag: "B", owner: "Rina · Screen 2", title: "Checkout v2" },
    { tag: "C", owner: "Dimas · Screen 1", title: "Checkout mobile" },
  ],
  cams: ["Rina", "Dimas", "Sari"],
} as const;

export const FEATURES = {
  title: "Built for comparing, not just presenting",
  sub: "zoomin's core features center on one thing: seeing several screens at once without taking turns.",
  items: [
    {
      icon: "screens",
      title: "Multiple screens per participant",
      body: "Share two or more windows at once — old and new versions, desktop and mobile — without stopping and starting over.",
    },
    {
      icon: "layout",
      title: "Host-controlled layout",
      body: "The host picks a side-by-side, grid, or focus template. Every participant sees the same arrangement.",
    },
    {
      icon: "move",
      title: "Drag, resize, enlarge",
      body: "Reorder tiles with drag and drop and resize them. Participants can still enlarge a tile on their own screen.",
    },
    {
      icon: "camera",
      title: "Camera and audio",
      body: "Faces and voices stay in the camera strip, separate from the screen stage so focus isn't broken.",
    },
    {
      icon: "invite",
      title: "Role-based invites",
      body: "Send invite links as host, participant, or viewer. Viewers watch without sharing anything.",
    },
    {
      icon: "server",
      title: "Self-hosted",
      body: "Runs on your own server on top of LiveKit. Rooms, accounts, and meeting media stay on your infrastructure.",
    },
  ],
} as const;

export const STEPS = {
  title: "How it works",
  sub: "From sign-in to screen comparison in three steps.",
  items: [
    { title: "Sign in with Google", body: "Sign in with a Google account. An admin creates a room and becomes its host." },
    { title: "Invite by role", body: "Share invite links for participants who present or viewers who watch." },
    { title: "Share and arrange", body: "Participants share multiple screens; the host arranges them to compare together." },
  ],
} as const;

export const USE_CASES = {
  title: "Use it for",
  items: [
    { tag: "A / B", title: "Design review", body: "Show two or three variants side by side and decide together, without switching screen shares back and forth." },
    { tag: "QA", title: "Cross-device QA", body: "Compare desktop, tablet, and mobile views of the same build on one stage." },
    { tag: "Class", title: "Training", body: "Instructors show the material and a hands-on example at once; trainees follow along as viewers." },
    { tag: "Demo", title: "Product demos", body: "Show the admin dashboard and the user view side by side so the flow is easy to follow." },
  ],
} as const;

export const FAQ = {
  title: "Frequently asked questions",
  items: [
    {
      q: "How many screens can one participant share?",
      a: "More than one. Each screen appears as its own tile on the stage, and the host can arrange its position.",
    },
    {
      q: "Who controls the layout?",
      a: "The room host. Template, tile order, and tile size apply to all participants. Enlarging a tile only changes the view on your own screen.",
    },
    {
      q: "Do participants need an account?",
      a: "Yes. Everyone signs in with a Google account, then joins the room through an invite link for their role.",
    },
    {
      q: "Where is data stored?",
      a: "On the server where zoomin is installed. Media is routed through your own LiveKit server.",
    },
  ],
} as const;

export const FINAL_CTA = {
  title: "Ready to compare screens with your team?",
  sub: "Sign in with your Google account to open the lobby and join your rooms.",
  cta: "Sign in with Google",
  subApp: "You're signed in. Continue to the lobby and join your rooms.",
  ctaApp: "Open app",
} as const;

export const FOOTER = {
  label: "Footer links",
  rights: "zoomin. Self-hosted meetings on LiveKit.",
  top: "Back to top",
} as const;

/** Every link the landing page renders (used by tests to check targets are valid). */
export const ALL_HREFS: readonly string[] = [
  ...NAV.links.map((l) => l.href),
  LOGIN_HREF,
  APP_HREF,
  `#${SECTION_IDS.top}`,
  `#${SECTION_IDS.main}`,
];
