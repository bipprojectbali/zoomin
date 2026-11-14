// Deklarasi tipe untuk file yang di-embed lewat `import x from "..." with { type: "text" }` (cli.docs.ts).
declare module "*.md" {
  const text: string;
  export default text;
}
declare module "*.example" {
  const text: string;
  export default text;
}
