# Rayners Lane FC — Website

Official website of Rayners Lane FC. Est. 1933. Harrow, London.
Combined Counties Premier Division North — Step 5.

## Stack
Pure HTML / CSS / JavaScript. No build tools. No dependencies.
Hosted on Netlify. Deployed via Git push.

## Folder structure
```
/
├── index.html          ← Homepage
├── fixtures.html       ← Live fixtures (Football Web Pages embed)
├── squad.html          ← Squad (Google Sheets CSV)
├── programme.html      ← Match day programme
├── about.html          ← Club, committee, ground
├── contact.html        ← Contact form
├── css/
│   └── style.css       ← Full design system
├── js/
│   ├── components.js   ← Nav + footer (shared)
│   ├── main.js         ← Homepage (countdown timer)
│   ├── pitchero.js     ← Live Pitchero RSS news feed
│   └── squad.js        ← Google Sheets squad integration
└── img/
    └── badge.png       ← Club badge (transparent PNG)
```

## Deploying changes — 3 commands

```bash
# 1. Navigate to the project
cd ~/Downloads/rayners\ lane\ website

# 2. Stage all changes
git add .

# 3. Commit with a description
git commit -m "describe what you changed"

# 4. Push — Netlify deploys automatically in ~30 seconds
git push
```

That's it. The site is live as soon as the push completes.

## One-time setup (do this once)

### Step 1 — GitHub
1. Go to github.com and create a free account
2. Click New Repository → name it `raynerslane-fc-website`
3. Set to Private → Create repository
4. Copy the repo URL shown (looks like https://github.com/USERNAME/raynerslane-fc-website.git)

### Step 2 — Connect this folder to GitHub

Open Terminal (Mac: Cmd+Space → type Terminal):

```bash
cd ~/Downloads/rayners\ lane\ website
git remote add origin YOUR_GITHUB_REPO_URL_HERE
git branch -M main
git push -u origin main
```

### Step 3 — Connect Netlify to GitHub
1. netlify.com → New site → Import from Git → GitHub
2. Select your raynerslane-fc-website repo
3. Build command: leave blank
4. Publish directory: leave blank (or put `/`)
5. Deploy site

From now on every `git push` auto-deploys. Takes ~30 seconds.

### Step 4 — Add custom domain in Netlify
1. Site Settings → Domain Management → Add domain → raynerslanefc.co.uk
2. Update nameservers in one.com to the Netlify ones shown

## Updating specific things

| What to update | Where | How |
|---|---|---|
| Next match countdown | `js/main.js` → NEXT_MATCH object | Edit + push |
| Squad list | Google Sheets (connected to site) | Manager updates sheet, no push needed |
| News | Automatic — pulls from Pitchero RSS | No action needed |
| Fixtures/results | Automatic — Football Web Pages / FA Full-Time | No action needed |
| Committee/staff | `about.html` + `squad.html` | Edit + push |
| Sponsors | `index.html` + `components.js` | Edit + push |

## Key contacts
- **Chairman:** Pete Singh
- **Vice Chairman:** Nigel Hanlon
- **President:** Martin Noblett
- **Manager:** Gary Pitt
- **Hospitality:** Tony Pratt
- **Committee:** Russell Nugent, Darren Nugent
