import { fmt, type Money } from "../../pool/src/money.ts";
import type { FamilyPool } from "../../pool/src/pool.ts";
import { defaultRail, describeRail, RAILS } from "../../pool/src/rails.ts";
import type { Presence } from "./db.ts";
import { esc, frag, layout, raw } from "./html.ts";
import { COUNTRIES, countryLabel, TIERS, tier } from "./tiers.ts";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

function whenLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

// ------------------------------------------------------------------ home ---

export function homePage(error?: string): string {
  const tiers = TIERS.map(
    (t) => `<div class="card tier">
      <input type="radio" name="tierId" id="tier-${esc(t.id)}" value="${esc(t.id)}" ${
        t.id === "ceremonie" ? "checked" : ""
      } />
      <div>
        <label for="tier-${esc(t.id)}"><b>${esc(t.name)}</b></label>
        <div class="dur">${esc(t.duration)}</div>
        <div class="small muted">${esc(t.typicalFor)}</div>
        <div class="small muted">${esc(t.includes.join(" · "))}</div>
      </div>
      <div class="price">${esc(fmt(t.price))}</div>
    </div>`,
  );

  return layout(
    {
      title: "Elongo — réserver une présence",
      description: "Quelqu'un se déplace à votre événement au pays, avec caméra et batterie.",
    },
    frag`
    ${raw(error ? `<div class="notice bad">${esc(error)}</div>` : "")}
    <h1>Être là, même de loin</h1>
    <p class="lede">Un correspondant se déplace à votre événement au pays, avec sa caméra,
    sa batterie et sa connexion. Personne dans la famille ne prête son téléphone, ne vide sa
    batterie, ni ne passe l'après-midi à filmer.</p>

    <form method="post" action="/book">
      <h2>L'événement</h2>
      <label>Nom de l'événement
        <input name="eventName" required maxlength="80" placeholder="Mariage de Grace &amp; Thierry" />
      </label>
      <div class="row">
        <label>Quand
          <input type="datetime-local" name="when" required />
        </label>
        <label>Où
          <input name="place" required maxlength="80" placeholder="Makélékélé, Brazzaville" />
        </label>
      </div>

      <h2>La formule</h2>
      <div class="cards">${raw(tiers.join(""))}</div>

      <h2>Vous</h2>
      <div class="row">
        <label>Votre prénom
          <input name="bookerName" required maxlength="40" placeholder="Sylvain" />
        </label>
        <label>Vous êtes où&nbsp;?
          <select name="bookerCountry">
            ${raw(
              COUNTRIES.map(
                (c) => `<option value="${esc(c.code)}">${esc(c.label)}</option>`,
              ).join(""),
            )}
          </select>
        </label>
      </div>
      <label>Combien de proches à l'étranger, à peu près&nbsp;?
        <input type="number" name="expected" min="1" max="60" value="9" />
        <span class="small muted">Sert seulement à proposer un montant par personne. Vous pourrez partager le lien avec toute la famille.</span>
      </label>

      <div class="actions">
        <button type="submit">Créer la cagnotte</button>
        <span class="small muted">Rien n'est débité maintenant.</span>
      </div>
    </form>`,
  );
}

// ------------------------------------------------------------------ pool ---

function payerRow(name: string, country: string, amount: Money, isShortfall: boolean): string {
  return `<li>
    <span class="who">
      <span>${esc(name)}</span>
      <span class="where">${esc(countryLabel(country))}</span>
      ${isShortfall ? '<span class="where shortfall">complément</span>' : ""}
    </span>
    <span class="amt">${esc(fmt(amount))}</span>
  </li>`;
}

export function poolPage(
  p: Presence,
  pool: FamilyPool,
  origin: string,
  flash?: { kind: "ok" | "warn" | "bad"; message: string },
): string {
  const t = tier(p.tierId);
  const target = pool.config.target;
  const raised = pool.raised;
  const share = Math.min(1, raised / target);
  const link = `${origin}/p/${p.reference}`;
  const closed = pool.status !== "open" && pool.status !== "funded";

  const payers = pool.all.length
    ? pool.all.map((c) => payerRow(c.name, c.country, c.amount, c.isShortfallCharge)).join("")
    : `<li class="muted">Personne n'a encore participé.</li>`;

  const funded = raised >= target;
  // Once the target is met, asking for another full share makes no sense. Drop
  // the default to the minimum and say plainly where the extra money goes —
  // funerals routinely overfund because nobody wants to be the relative who
  // gave least, and the surplus becoming family credit is a feature worth
  // stating rather than a surprise.
  const defaultAmount = funded ? 5 : Math.max(5, Math.ceil(pool.remaining / 100 / 4));

  const contributeForm = closed
    ? `<div class="notice warn">La cagnotte est fermée — l'événement est confirmé.</div>`
    : `${
        funded
          ? `<div class="notice ok">Objectif atteint. Les participations supplémentaires
             deviennent un avoir pour le prochain événement de la famille.</div>`
          : ""
      }
      <form method="post" action="/p/${esc(p.reference)}/contribute">
        <div class="row">
          <label>Votre prénom
            <input name="name" required maxlength="40" placeholder="Bernadette" />
          </label>
          <label>Vous êtes où&nbsp;?
            <select name="country">
              ${COUNTRIES.map((c) => `<option value="${esc(c.code)}">${esc(c.label)}</option>`).join("")}
            </select>
          </label>
        </div>
        <label>Montant (minimum 5&nbsp;€)
          <input type="number" name="amount" min="5" step="1" value="${defaultAmount}" required />
          ${
            funded
              ? ""
              : `<span class="small muted">Si vous êtes ${esc(String(pool.config.expectedParticipants))} à participer, comptez environ ${esc(fmt(pool.suggested))} chacun.</span>`
          }
        </label>
        <div class="actions">
          <button type="submit">Participer</button>
          <span class="small muted">Simulation — aucune carte n'est débitée.</span>
        </div>
      </form>`;

  // Internal panel. Not something a real customer would ever see; it is here so
  // the founder can watch the fee model from ../../pool behave on real input.
  const feePanel = `<details class="card">
    <summary class="small muted">Coulisses — ce que la répartition nous coûte</summary>
    <div class="table-scroll">
      <table>
        <thead><tr><th>Participant</th><th>Pays</th><th class="num">Montant</th><th class="num">Frais</th><th>Moyen</th></tr></thead>
        <tbody>
          ${
            pool.all
              .map(
                (c) => `<tr>
              <td>${esc(c.name)}</td>
              <td>${esc(c.country)}</td>
              <td class="num">${esc(fmt(c.amount))}</td>
              <td class="num">${esc(fmt(c.fee))}</td>
              <td class="small muted">${esc(RAILS[c.rail].label)} — ${esc(describeRail(RAILS[c.rail]))}</td>
            </tr>`,
              )
              .join("") || `<tr><td colspan="5" class="muted">—</td></tr>`
          }
        </tbody>
      </table>
    </div>
    <p class="fee-note">Total encaissé ${esc(fmt(raised))} · frais ${esc(fmt(pool.processingFees))} ·
    net ${esc(fmt(pool.netRevenue))}${
      raised > 0 ? ` · ${((pool.processingFees / raised) * 100).toFixed(1)}%` : ""
    }</p>
  </details>`;

  return layout(
    {
      title: `${p.eventName} — Elongo`,
      ogTitle: p.eventName,
      description: `${whenLabel(p.whenISO)} · ${p.place}. Participez pour que la famille à l'étranger puisse suivre en direct.`,
    },
    frag`
    ${raw(flash ? `<div class="notice ${flash.kind}">${esc(flash.message)}</div>` : "")}

    <div class="pool-head">
      <div class="when">${whenLabel(p.whenISO)} · ${p.place}</div>
      <h1>${p.eventName}</h1>
      <span class="state ${pool.status}">${statusLabel(pool.status)}</span>
    </div>

    <div class="card">
      <div class="amounts">
        <span class="big">${fmt(raised)}</span>
        <span class="muted">sur ${fmt(target)}</span>
      </div>
      <div class="progress ${raised >= target ? "full" : ""}"><i style="width:${(share * 100).toFixed(1)}%"></i></div>
      <div class="amounts small muted">
        <span>${pool.payerCount} participant${pool.payerCount === 1 ? "" : "s"}</span>
        <span>${raised >= target ? "Objectif atteint" : `Il reste ${fmt(pool.remaining)}`}</span>
      </div>
      ${raw(t ? `<p class="small muted" style="margin-bottom:0">Formule ${esc(t.name)} — ${esc(t.duration)}. ${esc(t.includes.join(" · "))}.</p>` : "")}
    </div>

    <h2>Participer</h2>
    ${raw(contributeForm)}

    <h2>La famille</h2>
    <ul class="payers">${raw(payers)}</ul>

    <h2>Partager avec la famille</h2>
    <p class="small muted">Envoyez ce lien dans le groupe WhatsApp. Chacun participe comme il peut.</p>
    <div class="share">
      <input class="mono" value="${link}" readonly onclick="this.select()" />
      <a class="btn ghost" href="https://wa.me/?text=${encodeURIComponent(`${p.eventName} — participez : ${link}`)}">WhatsApp</a>
    </div>

    <div class="wa">
      <div class="wa-bubble">
        <div class="wa-card">
          <b>${p.eventName}</b>
          <span>${whenLabel(p.whenISO)} · ${p.place}</span>
          <span>Participez pour que la famille à l'étranger puisse suivre en direct.</span>
        </div>
        <div class="wa-link">${link}</div>
      </div>
    </div>
    <p class="small muted">Voilà ce que la famille verra dans WhatsApp.</p>

    ${raw(feePanel)}

    <p class="small muted" style="margin-top:2rem">
      Référence <b class="mono">${p.reference}</b> — à donner au téléphone si besoin.
      <a href="/ops">Vue opérations</a>
    </p>`,
  );
}

function statusLabel(state: string): string {
  const labels: Record<string, string> = {
    open: "ouverte",
    funded: "financée",
    confirmed: "confirmée",
    delivered: "livrée",
    cancelled: "annulée",
    failed: "échec — remboursée",
  };
  return labels[state] ?? state;
}

// ------------------------------------------------------------------- ops ---

export function opsPage(
  rows: Array<{ presence: Presence; pool: FamilyPool }>,
  flash?: { kind: "ok" | "warn" | "bad"; message: string },
): string {
  if (rows.length === 0) {
    return layout(
      { title: "Opérations — Elongo", wide: true },
      frag`<h1>Opérations</h1>
      <div class="empty">
        <p>Aucune réservation pour l'instant.</p>
        <a class="btn" href="/">Créer la première</a>
        <p class="small muted" style="margin-top:1.5rem">Ou chargez trois exemples&nbsp;:<br />
        <code class="mono">npm run seed</code></p>
      </div>`,
    );
  }

  const body = rows
    .map(({ presence: p, pool }) => {
      const closed = pool.status !== "open" && pool.status !== "funded";
      const done = ["delivered", "cancelled", "failed"].includes(pool.status);
      const button = (action: string, label: string, cls: string) =>
        `<form method="post" action="/p/${esc(p.reference)}/${action}">
           <button class="btn small ${cls}" type="submit">${esc(label)}</button></form>`;

      const actions = [
        !closed ? button("close", "Clôturer", "ghost") : "",
        pool.status === "confirmed" ? button("deliver", "Marquer livrée", "") : "",
        !done ? button("refund", "Rembourser", "danger") : "",
      ]
        .filter(Boolean)
        .join("");

      return `<tr>
        <td class="ev"><a href="/p/${esc(p.reference)}"><b>${esc(p.eventName)}</b></a><br />
            <span class="small muted mono">${esc(p.reference)} · ${esc(p.place)}</span></td>
        <td><span class="state ${esc(pool.status)}">${esc(statusLabel(pool.status))}</span></td>
        <td class="num">${esc(fmt(pool.raised))}<br /><span class="small muted">sur ${esc(fmt(pool.config.target))}</span></td>
        <td class="num">${pool.payerCount}<br /><span class="small muted">${pool.firstTimers} nouv.</span></td>
        <td class="num">${esc(fmt(pool.processingFees))}</td>
        <td class="act">${actions || '<span class="small muted">—</span>'}</td>
      </tr>`;
    })
    .join("");

  const totalRaised = rows.reduce((n, r) => n + r.pool.raised, 0);
  const totalFees = rows.reduce((n, r) => n + r.pool.processingFees, 0);
  const totalNew = rows.reduce((n, r) => n + r.pool.firstTimers, 0);

  return layout(
    { title: "Opérations — Elongo", wide: true },
    frag`
    ${raw(flash ? `<div class="notice ${flash.kind}">${esc(flash.message)}</div>` : "")}
    <h1>Opérations</h1>
    <p class="lede">${rows.length} réservation${rows.length === 1 ? "" : "s"} ·
    ${fmt(totalRaised)} encaissés · ${fmt(totalFees)} de frais ·
    ${totalNew} proches découvrant Elongo.</p>

    <div class="table-scroll">
      <table>
        <thead><tr>
          <th>Événement</th><th>État</th><th class="num">Cagnotte</th>
          <th class="num">Participants</th><th class="num">Frais</th><th>Actions</th>
        </tr></thead>
        <tbody>${raw(body)}</tbody>
      </table>
    </div>

    <h2>Ce que fait chaque action</h2>
    <p class="small muted"><b>Clôturer</b> — simule la veille de l'événement. Si la cagnotte
    n'est pas complète, le complément est débité à la personne qui a réservé : un événement
    n'est jamais annulé parce qu'un cousin n'a pas payé. Le surplus devient un avoir pour le
    prochain événement de la famille.</p>
    <p class="small muted"><b>Rembourser</b> — la garantie : si nous ne livrons pas
    l'enregistrement complet, tout le monde est remboursé. Les frais bancaires, eux, ne
    reviennent pas — un échec coûte de l'argent réel.</p>

    <p class="actions"><a class="btn ghost" href="/">Nouvelle réservation</a></p>`,
  );
}
