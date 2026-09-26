# Chrome Web Store listing

Everything the submission form asks for, written out so it can be pasted rather
than improvised in the dashboard at midnight. Reviewers reject vague permission
justifications more often than they reject anything else, so those are the part
worth reading before you start.

The checklist at the bottom is the honest state of play: some of it cannot be
done from a repo.

---

## Single purpose

> jlog helps you apply to jobs: it records the jobs you apply to in your own jlog
> account, and fills in application forms from the profile you saved there. It
> never submits a form for you.

Chrome asks for one purpose and means it. An extension that does two unrelated
things gets rejected, so this deliberately does not mention the dashboard, the
CV tooling, or anything else jlog does on the web. Recording applications and
filling them in are one purpose, applying to jobs, and the statement says so in
those words rather than listing two features. Keep "never submits": an
extension that fills forms is exactly what a reviewer checks for acting on the
user's behalf, and it is true (`autofill.test.ts` checks it).

**Two claims not to make**, both of which an earlier draft of this file made and
neither of which is true of the code:

1. *"Nothing is recorded without you seeing it first."* On the six supported
   boards, `JOB_DETECTED` goes straight from the content script to `saveJob` in
   the background worker. There is no confirmation step; that only exists on the
   manual "Extract with AI" path.
2. *"Automatic capture records the location and job description."* The content
   scripts send company, role, `sourceUrl`, `sourceSite` and `appliedAt`, and
   nothing else. Location and description come from the manual extraction path.

A store listing that overstates what the user controls, or what is collected, is
exactly what the review process is looking for.

## Short description (132 characters max)

> Track job applications from LinkedIn, Greenhouse, Lever and more, and fill in
> application forms from your profile.

Currently 114 characters. This is the string in `manifest.config.ts`; if you
change one, change both or the listing and the extension disagree.

## Detailed description

> Applying to jobs is easy to do and hard to keep track of. jlog watches the job
> boards you already use and records what you applied to, so the list maintains
> itself.
>
> On LinkedIn, Wellfound, Ashby, Greenhouse, Lever and Y Combinator's job board,
> applications are captured as you make them — no copying, no spreadsheet. jlog
> records the company, the role, the link and the date, and you can edit or
> delete any of it afterwards.
>
> On any other careers page, click the jlog icon and "Extract with AI" reads the
> posting and fills in the company, role and location, which you confirm before
> anything is saved.
>
> On Greenhouse, Lever and Ashby application forms, including ones embedded in a
> company's own careers site, a "Fill with jlog" button fills your name, email,
> phone, links and location from your jlog profile. Visa, salary and equal
> opportunity questions are filled only from answers you saved yourself, and
> left empty otherwise. jlog only fills empty fields, and it never submits: you
> read the form and press submit.
>
> With jlog Pro, open questions such as "Why do you want to work here?" get a
> "Draft" button. It writes an answer from the experience in your profile and
> lists the facts it used, so you can check it before you send it. If your
> profile does not cover the question, it says so instead of making something
> up.
>
> Everything lands in your jlog dashboard, where you can track status from saved
> through applied, interviewing, and offer — with notes, the original posting,
> and a timeline of what happened when.
>
> jlog is open source and self-hostable. If you would rather run it yourself,
> the whole thing is at github.com/brgv-code/jlog.
>
> You will need a free jlog account to connect the extension.

## Category

**Productivity.** Not "Workflow & Planning" — that category is dominated by
project-management tools and this is a personal record-keeper.

## Language

English (UK or US — the extension copy uses UK spelling; pick one and be
consistent with the store listing).

---

## Permission justifications

Fill these into the "Privacy practices" tab. Each has to say what the permission
does *for the user*, not what the code does with it.

### `storage`

> Stores the key that links this browser to your jlog account, and a cached note
> of whether that key is still valid, so the extension can tell you plainly when
> it has expired instead of failing silently.

### `activeTab`

> Lets the extension read the job posting on the tab you are looking at, and
> only after you click the jlog icon. It is what "Extract with AI" reads. No
> other tab is ever accessed, and nothing is read until you ask for it.

### `scripting`

> Runs the small reader that pulls the company, role and location out of the
> page you asked to extract. Without it the extension would have no way to see
> the posting you are trying to save.

### Host permission — `https://jlog-api.bhargav.dev/*`

> jlog's own API. This is where your tracked applications are saved. It is the
> only server the extension ever contacts.

### Host permissions — the job boards

> LinkedIn, Wellfound, Ashby, Greenhouse, Lever and Y Combinator's job board are
> the sites where jlog records an application automatically, without you having
> to click anything. On these sites it reads only the company name, the job
> title and the page address, and saves them to your own jlog account. It does
> not read the job description on these sites, and it reads nothing at all on
> any other site unless you click the jlog icon.

On Greenhouse, Lever and Ashby, the same permission lets jlog show its "Fill
with jlog" button on application forms, and a "Draft" button on open questions.
Paste this as a second paragraph:

> On Greenhouse, Lever and Ashby application forms, jlog reads the labels of the
> form's fields so it can fill the ones it recognises from your jlog profile. It
> only fills empty fields and never submits the form. The form's contents are
> not sent anywhere; if you click "Draft" on a question, that question and the
> job posting on the page are sent to jlog to write the answer.

**Decided: keep them.** An earlier note here suggested dropping these six in
favour of the content scripts' own `matches`. That would not shrink anything:
Chrome builds the install warning from content script match patterns as well
as `host_permissions`, so the user sees "read and change your data on" the same
six sites either way. Keeping both lists identical is the honest state, and one
less thing for a reviewer to reconcile.

### Content scripts in all frames

The autofill script runs with `all_frames: true`. If the form asks why:

> Many companies embed their Greenhouse, Lever or Ashby application form in
> their own careers page, inside a frame. The fill button runs inside that frame
> so it can reach the form. It still runs only on those three sites' pages.

### Remote code

> No. All code is contained in the uploaded package.

This is true and worth being definite about — the extension loads no external
scripts.

---

## Data disclosure

The form asks what you collect. Answer honestly; the privacy policy has to agree
with it.

| Question | Answer |
|---|---|
| Personally identifiable information | **Yes** — name and email, via your jlog account; and, if you save them for autofill, phone number, salary expectation, the countries you can work in, and your preference to decline equal opportunity questions |
| Health information | No |
| Financial and payment information | No |
| Authentication information | **Yes** — the extension key that links this browser to your account |
| Personal communications | No |
| Location | No |
| Web history | **Yes** — the URL of a job posting you save is stored with the application |
| User activity | No |
| Website content | **Yes** — on the six supported boards, the company and role from the posting; on any other site, the text of a posting you explicitly choose to extract; on Greenhouse, Lever and Ashby, when you click "Draft", the question and the text of the posting on that page |

The autofill button itself sends nothing about the form: it asks jlog for your
profile and fills fields in the page. Only "Draft" sends page content, and only
when clicked.

Then tick all three certifications: data is not sold, not used for anything
unrelated to the single purpose above, and not used for creditworthiness or
lending.

**Privacy policy URL:** `https://jlog.bhargav.dev/privacy/`
(with the trailing slash — without it the URL redirects, and it is better not to
hand a reviewer a redirect).

---

## Before you can submit

Things this repo can produce:

- [x] A 128×128 icon — `public/icons/icon-128.png`
- [x] An uploadable zip — `pnpm --filter @jlog/extension package`. It refuses to
      run if `VITE_API_BASE` or `VITE_WEB_BASE` is unset or points at localhost:
      `.env` is gitignored, so on a fresh clone the obvious command would
      otherwise produce an upload-ready bundle aimed at the user's own machine,
      and an extension cannot be repointed after installation. It writes the
      archive with Node's zlib rather than shelling out to `zip`, so it needs no
      tools beyond Node.
- [x] A reachable privacy policy that describes the extension
- [x] The copy on this page

Things that need you:

- [ ] **At least one screenshot**, 1280×800 or 640×400. This is a hard blocker —
      the form will not submit without one. Worth taking three: the popup on a
      LinkedIn posting, the popup mid-extraction on some other careers page, and
      the dashboard the applications land in.
- [ ] **A developer account**, which costs a one-off $5 registration fee.
- [ ] **Decide on the version.** The manifest says `0.1.0`. A first public
      release is usually `1.0.0`, and the store will not let you go backwards
      once published.
- [x] **Decide on the host permissions**: keep them, see the note above.
- [ ] Optional: a 440×280 promotional tile, which the store uses if it ever
      features the extension.

## After it is published

- [ ] Add the store link to the landing page (`apps/web/src/pages/index.astro`),
      which currently mentions the extension without offering a way to install it.
- [ ] Update the README's install section, which describes loading an unpacked
      build — right for a contributor, wrong for everyone else.
