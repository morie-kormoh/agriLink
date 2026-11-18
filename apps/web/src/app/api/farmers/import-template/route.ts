import { CSV_TEMPLATE_HEADER } from "@agripay/validation";

export function GET() {
  const example = [
    "Aminata Kamara,F,076123456,1990-05-14,,BOM,Gbanti,Kagbo,RICE,2.5,Orange Money",
    "Mohamed Sesay,M,077654321,,,BOM,Biriwa,Kamabai,GROUNDNUT,1,Afrimoney",
  ].join("\n");
  return new Response(`${CSV_TEMPLATE_HEADER}\n${example}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="agripay-farmers-template.csv"',
    },
  });
}
