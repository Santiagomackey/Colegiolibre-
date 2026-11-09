# Direct transfer purchases — ColegioLibre

This feature moves money outside ColegioLibre. “Mercado Pago” means a transfer to the seller’s wallet alias/CVU, not Mercado Pago Checkout or an automatic payment integration. Buyers may use any compatible bank/wallet. No Mercado Pago API key is required.

## Deploy

1. Back up the database and test in a Supabase staging project first. Apply the existing profiles/products, messaging and notifications migrations, then run `database/10_direct_transfer_orders.sql` in Supabase SQL Editor. It requires `products`, `profiles`, `conversations` and `notifications`, including the existing moderation fields and `products.reserved_for`.
2. Deploy the complete web source. The product page now links Comprar to `/compra?product=...`; `/pedidos` lists purchases and sales. Perfil → Configuración → Datos de cobro is also linked from `/perfil?view=settings#datos-cobro`.
3. For the Android bundle run the existing sync/build workflow. No new native payment plugin is used. Existing notification delivery still requires the Firebase/Supabase webhook configuration in `APPLE_AND_PHONE_NOTIFICATIONS.md`.
4. Run `npm ci` in the web root and `npm test` for the complete test suite. The new tests use PGlite’s PostgreSQL engine locally; no production credentials or money are used.

This package is source code. Its migration has not been applied to production, no real bank transfer was made, and no APK was compiled in this environment.

## Seller setup and privacy

The seller enters Mercado Pago or bank transfer, alias, 22-digit CBU/CVU and account holder name. Leading zeroes are preserved. Both client and database validate the format. These checks do not verify bank ownership, existence, balance or that an alias and account number refer to the same account. Buyers must check the bank’s displayed recipient before sending money.

Payment details are stored separately from public profiles in `seller_payment_details`. RLS is enabled on all payment/order tables, and direct API table access is revoked. Owner-only RPCs retrieve/update setup details. Order instructions are snapshotted in a separate private table; an authorized order RPC only returns them to that order’s buyer/seller while payment is pending or awaiting verification. They are omitted after payment, delivery or cancellation. Order lists never return bank details. Private values are not stored in localStorage or logged by this feature; profile inputs and checkout instructions are cleared when leaving the page.

Orders take their price, seller and listing title from the locked database product row. Callers cannot submit an amount or a paid status. Existing orders retain their original price and payment instructions when a seller changes settings.

Format references: https://www.bcra.gob.ar/alias-cbu/ and https://www.bcra.gob.ar/clave-bancaria-uniforme-cbu/

## Order states and authority

| Database state | Spanish | Who may advance it |
| --- | --- | --- |
| payment_pending | Pendiente de pago | Buyer reports an external transfer |
| awaiting_confirmation | Esperando confirmación | Seller verifies money in their account and confirms |
| paid | Pagado | Buyer confirms receiving the material |
| delivered | Entregado | Final state |

“Ya transferí” creates a buyer claim and notifies the seller. It never marks an order paid. A receipt or screenshot cannot approve payment: there is no receipt approval endpoint. Only the seller can call the payment-confirmation transition, after the UI explicitly asks them to verify the actual credited money. Neither the application nor this implementation checks the external bank automatically.

Pending orders can be cancelled before a transfer claim. Once a transfer has been reported, cancellation/refunds/disputes must be resolved between the participants/support rather than silently releasing a possibly paid order. There is no automatic expiration, refund or escrow. Do not mark an unpaid claim as paid merely to release an item.

Only one active purchase order is allowed per product. A product cannot be sold/reserved through another flow during an active checkout. Moderation can still pause a listing; checkout warns against a new transfer when the listing is unavailable. Seller payment confirmation marks the product sold. Checkout creates a private conversation up front, so both participants can arrange delivery at school even after the listing is sold.

## Verification before real use

Use at least three staging accounts: seller, buyer, unrelated user.

- Save seller payment details; check an anonymous or unrelated user cannot retrieve them directly or through an order ID.
- Start a purchase. Verify the exact ARS amount, recipient and Copiar alias. Change the seller’s payment settings/price; confirm that this existing order retains its original values.
- Have another buyer try the same product: a second active checkout must be rejected.
- As buyer, click Ya transferí: status must remain Esperando confirmación. A direct attempt to confirm payment or skip to Entregado must fail.
- As seller, verify the bank account manually before Confirmar pago recibido. Only then should status become Pagado and the buyer receive a notification.
- Open the delivery chat from each account, arrange school delivery and have the buyer confirm receipt. Verify Entregado.
- Test cancellation before a transfer, network failures, repeated clicks, a paused listing, both languages, both themes and narrow phone screens.

The automated PostgreSQL tests cover role checks, blocked direct writes, isolated bank details, fixed amount/account snapshots, competing buyers, cancellation, state transitions and notification recipients. Live Supabase policies/triggers from the existing application and real phone delivery still need the staging checks above.
