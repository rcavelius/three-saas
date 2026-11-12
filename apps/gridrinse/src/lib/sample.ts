/**
 * A realistic messy export: an online shop's order list pulled from two systems and pasted together.
 * It has stray spaces, a non-breaking space, blank rows, exact and near-duplicate rows, dates in
 * several formats (and one column whose day/month order cannot be known), and currency-formatted amounts.
 * All names and emails are invented.
 */
export const SAMPLE_FILE_NAME = "sample-orders-export.csv";

export const SAMPLE_CSV = [
  " Order ID,Customer Name ,Email,Order Date,Signup Date,Amount,Discount,Status,Country",
  "10231,  Maria   Lopez,maria.lopez@example.com,2024-01-05,03/04/2023,\"$1,234.50\",10%,Shipped,Spain",
  "10232,Tom Becker ,tom.becker@example.org,1/15/2024,05/06/2023,$89.99,0%,shipped ,Germany",
  "10233,Aiko Tanaka,aiko.t@example.net,\"Jan 17, 2024\",11/02/2023,\"$2,005.00\",5%,Pending,Japan",
  ",,,,,,,,",
  "10234,Liam O'Brien,liam.obrien@example.com,01/18/2024,07/08/2023,(45.00),0%,Refunded,Ireland",
  "10235,Chloé Martin,chloe.martin@example.fr,2024-01-19,09/10/2023,  $310.20 ,15%,Shipped,France",
  "10231,  Maria   Lopez,maria.lopez@example.com,2024-01-05,03/04/2023,\"$1,234.50\",10%,Shipped,Spain",
  "10236,Noah Smith,noah.smith@example.com,1/22/2024,12/01/2023,$58.00,0%,Shipped,USA",
  "10237,Sofia Rossi,sofia.rossi@example.it,\"Jan 23, 2024\",02/03/2023,$1050,,Pending,Italy",
  "",
  "10238,Ethan Clark,ethan.clark@example.com,01/24/2024,04/05/2023,\"$12,500.00\",20%,Shipped,USA",
  "10239,Olivia Brown,olivia.brown@example.co.uk,2024-01-25,06/07/2023,£75.40,0%,Cancelled,UK",
  "10240,Lucas Silva,lucas.silva@example.com.br,1/26/2024,08/09/2023,$199.95,5%,Shipped,Brazil",
  "10236, Noah Smith ,NOAH.SMITH@example.com,1/22/2024,12/01/2023,$58.00,0%,Shipped,USA",
  "10241,Emma Wilson,emma.wilson@example.com,\"Jan 29, 2024\",10/11/2023,$420.00,10%,Shipped,Canada",
  "10242,Mateo García,mateo.garcia@example.es,01/30/2024,01/02/2023,(12.50),0%,Refunded,Spain",
  "   ,  ,,,,,,,",
  "10243,Hannah Müller,hannah.mueller@example.de,1/31/2024,03/03/2023,$1 005.00,0%,Shipped,Germany",
  "10244,Arjun Patel,arjun.patel@example.in,2024-02-01,05/04/2023,$64.10,0%,Pending,India",
  "10245,Grace Kim​,grace.kim@example.com,2/2/2024,07/06/2023,$880.00,5%,Shipped,South Korea",
].join("\r\n") + "\r\n";
