/** Small, deliberately conservative English stopword list; no stemming. */
const STOPWORDS = new Set(
	"a an and are as at be been being but by can could did do does for from had has have how if in into is it its may not of on or our should than that the their them then there these they this those to was we were what when where which who will with would you your".split(
		" ",
	),
);

/** Strip Markdown noise before lowercasing and splitting into ASCII words. */
export function tokenizeDoc(body: string): string[] {
	const lines = body
		.replace(/^\uFEFF/, "")
		.replace(/\r\n?/g, "\n")
		.split("\n");
	let start = 0;
	if (lines[0] === "---") {
		const end = lines.findIndex(
			(line, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(line),
		);
		start = end < 0 ? lines.length : end + 1;
	}
	const prose: string[] = [];
	let fence = "";
	for (const line of lines.slice(start)) {
		if (fence) {
			const close = /^ {0,3}(`+|~+)\s*$/.exec(line)?.[1];
			if (close && close[0] === fence[0] && close.length >= fence.length)
				fence = "";
			continue;
		}
		const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		if (open?.[1] && !(open[1][0] === "`" && open[2]?.includes("`"))) {
			fence = open[1];
		} else {
			prose.push(line);
		}
	}
	const text = prose
		.join("\n")
		// Matching backtick runs, including multi-backtick inline code spans.
		.replace(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, " ")
		.replace(/(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>]+/gi, " ")
		.toLowerCase();
	return (text.match(/[a-z0-9]+/g) ?? []).filter(
		(token) => token.length >= 3 && !STOPWORDS.has(token),
	);
}
