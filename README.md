# faceit-pick-ban-predictor
Discover your opponent's map preferences

## Prerequisites
### Install Bun
#### Linux
```sh
curl -fsSL https://bun.sh/install | bash
```
#### Windows
```sh
powershell -c "irm bun.sh/install.ps1 | iex"
```

### Install dependencies:
```sh
bun install
bunx playwright install
bunx playwright install-deps
```

## Run the program
```sh
bun run get-preferences
```
When prompted, input the team's Faceit page URL and hit enter
