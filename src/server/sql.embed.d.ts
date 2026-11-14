// Tipe untuk migrasi yang di-embed lewat `import x from "*.sql" with { type: "text" }` (db.ts).
declare module "*.sql" {
  const text: string;
  export default text;
}
