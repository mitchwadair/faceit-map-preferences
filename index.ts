import { chromium } from "playwright";

const teamURL = prompt("Faceit Team URL:");
if (!teamURL) {
	process.exit();
}

const scores: Record<string, Array<number>> = {};

const browser = await chromium.launch({
	headless: true,
	args: ["--disable-gpu"],
});
const contextOpts = {
	//viewport: { width: 1920, height: 1080 },
	userAgent:
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
};
const context = await browser.newContext(contextOpts);
const page = await context.newPage();

await page.goto(teamURL);

// wait for page to render (faceit slow as shit)
await page.waitForSelector("h4[class*='HeadingBase']", { state: "visible" });

const teamHeader = await page.locator("h4[class*='HeadingBase']");
const teamName = (await teamHeader.innerHTML()).split("(")[0];

console.log();
console.log("Team: ", teamName);
console.log();

await page
	.locator("span[class*='Primary__PrimaryLabel']", {
		hasText: "League",
	})
	.click();

await page.waitForURL((url) => url.pathname.includes("/leagues"));
await page.waitForSelector("h5[class*='HeadingBase']");
await page.waitForSelector("button:has-text('View Details')");
const matches = await page
	.locator("a:has(button:has-text('View Details'))")
	.all();
for (const [i, match] of matches.entries()) {
	// if (i < 15) {
	// 	continue;
	// }
	const href = await match.getAttribute("href");
	if (!href) {
		continue;
	}

	const matchCtx = await browser.newContext(contextOpts);
	const matchPage = await matchCtx.newPage();

	await matchPage.goto(`https://faceit.com${href}`);

	try {
		// only parse through completed matches
		await matchPage.waitForSelector("div[class*='Finished__Container']", {
			timeout: 10000,
		});
	} catch {
		await matchCtx.close();
		continue;
	}

	await matchPage.waitForSelector("span:has-text('Map')");
	await matchPage.waitForSelector("div[class*='FactionsDetails__Info']");
	await matchPage.waitForTimeout(5000);

	const info = await matchPage
		.locator("div[class*='FactionsDetails__Info']")
		.innerHTML();
	const isBestOfOne = info === "Best of 1";

	const teams = await matchPage
		.locator("div[class*='FactionsDetails__Faction-']")
		.all();
	const team1 = await teams[0]
		.locator("h6[class*='__FactionName']")
		.innerHTML();
	const team1Score = Number.parseInt(
		await teams[0].locator("[class*='__FactionScore']").innerHTML(),
	);
	const team2 = await teams[1]
		.locator("h6[class*='__FactionName']")
		.innerHTML();
	const team2Score = Number.parseInt(
		await teams[1].locator("[class*='__FactionScore']").innerHTML(),
	);

	let emoji = "❌";
	let outcome = "Loss";
	if (
		(team1 === teamName && team1Score > team2Score) ||
		(team2 === teamName && team2Score > team1Score)
	) {
		emoji = "✅";
		outcome = "Win";
	}

	const details = await matchPage.locator("span[class*='styles__Name']").all();
	const map1 = await details[1].innerHTML();
	console.log(
		`${emoji} **Match ${i + 1}**: ${team1Score} - ${team2Score} ${outcome}${isBestOfOne ? ` on ${map1}` : ""}: https://faceit.com${href}`,
	);

	if (!isBestOfOne) {
		try {
			console.log("- Maps:");
			const prefs = await matchPage
				.locator("[data-testid='matchPreference']")
				.all();
			for (const [pi, pref] of prefs.entries()) {
				if (pi === 0) {
					continue;
				}
				const map = await pref.locator("span[class*='__Name']").innerHTML();
				const scores = await pref
					.locator("span[class*='MapResult__Score']")
					.all();
				try {
					console.log(
						`  - ${map}: ${await scores[0].innerHTML()} - ${await scores[1].innerHTML()}`,
					);
				} catch {
					console.log(`  - ${map}`);
				}
			}
		} catch {
			console.log("  - Needs manual investigation");
		}
	}

	try {
		await matchPage.waitForSelector("[data-testid='mapsVetoHistory']", {
			timeout: 2000,
		});
	} catch {
		console.log("- Vetos missing");
		console.log();

		await matchCtx.close();
		continue;
	}

	await matchPage.getByTestId("mapsVetoHistory").click();
	const vetos = await matchPage.locator("li[class*='HistoryItem__Li']").all();
	let wave = 0;
	let prevTeam = "";
	console.log("- Vetos:");
	for (const [i, veto] of vetos.entries()) {
		const content = await veto.locator("span").innerHTML();
		if (content.includes("banned")) {
			const [team, map] = content.split(" banned ");
			if (!scores[map]) {
				scores[map] = [];
			}
			if (team === teamName) {
				let score = 1;
				if (isBestOfOne) {
					score = wave === 0 || (wave === 1 && prevTeam === team) ? 5 : 3;
				} else {
					score = wave === 0 ? 6 : 4;
				}
				scores[map].push(score);
				wave++;
				console.log(`  - ${team} ban ${map}`);
			} else {
				scores[map].push(1);
				console.log(`  - Others ban ${map}`);
			}
			prevTeam = team;
		} else if (content.includes("picked by")) {
			const [map, team] = content.split(" picked by ");
			if (!scores[map]) {
				scores[map] = [];
			}
			if (team === teamName) {
				scores[map].push(-2);
			}
			if (!content.includes("picked by default")) {
				if (team === teamName) {
					console.log(`  - ${team} pick ${map}`);
				} else {
					console.log(`  - Others pick ${map}`);
				}
			}
			prevTeam = team;
		}
	}

	console.log();
	await matchCtx.close();
}

await context.close();
await browser.close();

function reduceSum(nums: Array<number>) {
	return nums.reduce((n, v) => n + v, 0);
}

console.log("Map preferences:");
let i = 1;
for (const [map, s] of Object.entries(scores).sort(
	([_m1, s1], [_m2, s2]) => reduceSum(s1) - reduceSum(s2),
)) {
	console.log(`${i}. ${map}: ${reduceSum(s)} -> ${s.join(",")}`);
	i++;
}
