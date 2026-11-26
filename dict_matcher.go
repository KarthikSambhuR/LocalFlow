package main

import (
	"bufio"
	"bytes"
	"compress/gzip"
	_ "embed"
	"fmt"
	"sort"
	"strings"
	"unicode"
)

//go:embed english_words_20k.txt.gz
var englishWordsGZ []byte

// commonEnglishWords guards against blindly overwriting valid common English words
// (e.g. "shampoo", "comment", "commit") during non-LLM fuzzy replacement.
var commonEnglishWords = func() map[string]struct{} {
	m := make(map[string]struct{}, 20000)
	gz, err := gzip.NewReader(bytes.NewReader(englishWordsGZ))
	if err != nil {
		return m
	}
	defer gz.Close()

	scanner := bufio.NewScanner(gz)
	for scanner.Scan() {
		w := strings.TrimSpace(scanner.Text())
		if w != "" {
			m[w] = struct{}{}
		}
	}
	return m
}()

// phoneticKey computes a Metaphone-inspired signature that equates common
// Whisper voiced/unvoiced and aspirated consonant swaps (p/b, t/d, k/g, sh/s).
func phoneticKey(word string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(word) {
		if r >= 'a' && r <= 'z' {
			b.WriteRune(r)
		}
	}
	s := b.String()
	if s == "" {
		return ""
	}

	replacements := []struct{ old, new string }{
		{"kn", "n"},
		{"gn", "n"},
		{"wr", "r"},
		{"wh", "w"},
		{"ph", "f"},
		{"gh", "g"},
		{"qu", "kw"},
		{"ck", "g"},
		{"bh", "b"},
		{"dh", "d"},
		{"th", "d"},
		{"kh", "g"},
		{"sh", "s"},
		{"ch", "c"},
		{"zh", "s"},
	}
	for _, rep := range replacements {
		s = strings.ReplaceAll(s, rep.old, rep.new)
	}

	var out strings.Builder
	runes := []rune(s)
	var prev rune
	for i, r := range runes {
		switch r {
		case 'c':
			if i+1 < len(runes) && (runes[i+1] == 'e' || runes[i+1] == 'i' || runes[i+1] == 'y') {
				r = 's'
			} else {
				r = 'g'
			}
		case 'p':
			r = 'b'
		case 't':
			r = 'd'
		case 'k', 'q':
			r = 'g'
		case 'z':
			r = 's'
		case 'v':
			r = 'w'
		case 'x':
			if prev != 'g' {
				out.WriteRune('g')
			}
			r = 's'
		}

		// Drop non-leading vowels and 'h'
		if i > 0 && (r == 'a' || r == 'e' || r == 'i' || r == 'o' || r == 'u' || r == 'y' || r == 'h') {
			continue
		}
		if r == prev {
			continue
		}
		out.WriteRune(r)
		prev = r
	}
	return out.String()
}

func isVowel(r rune) bool {
	switch r {
	case 'a', 'e', 'i', 'o', 'u', 'y':
		return true
	}
	return false
}

func consonantGroup(r rune) rune {
	switch r {
	case 'b', 'p':
		return 'b'
	case 'd', 't':
		return 'd'
	case 'g', 'k', 'c', 'q':
		return 'g'
	case 's', 'z':
		return 's'
	case 'f', 'v':
		return 'f'
	case 'v' + 1000, 'w':
		return 'w'
	}
	return r
}

func weightedEditDistance(a, b string) float64 {
	ra := []rune(strings.ToLower(a))
	rb := []rune(strings.ToLower(b))
	la, lb := len(ra), len(rb)
	if la == 0 {
		return float64(lb)
	}
	if lb == 0 {
		return float64(la)
	}

	prev := make([]float64, lb+1)
	curr := make([]float64, lb+1)
	for j := 0; j <= lb; j++ {
		prev[j] = float64(j)
	}
	for i := 1; i <= la; i++ {
		delCost := 1.0
		if ra[i-1] == 'h' || isVowel(ra[i-1]) {
			delCost = 0.35
		}
		curr[0] = prev[0] + delCost
		for j := 1; j <= lb; j++ {
			insCost := 1.0
			if rb[j-1] == 'h' || isVowel(rb[j-1]) {
				insCost = 0.35
			}
			subCost := 1.0
			if ra[i-1] == rb[j-1] {
				subCost = 0
			} else if isVowel(ra[i-1]) && isVowel(rb[j-1]) {
				subCost = 0.25
			} else if consonantGroup(ra[i-1]) == consonantGroup(rb[j-1]) {
				subCost = 0.25
			}

			del := prev[j] + delCost
			ins := curr[j-1] + insCost
			sub := prev[j-1] + subCost
			m := del
			if ins < m {
				m = ins
			}
			if sub < m {
				m = sub
			}
			curr[j] = m
		}
		prev, curr = curr, prev
	}
	return prev[lb]
}

func editDistance(a, b string) int {
	ra := []rune(strings.ToLower(a))
	rb := []rune(strings.ToLower(b))
	la, lb := len(ra), len(rb)
	if la == 0 {
		return lb
	}
	if lb == 0 {
		return la
	}

	prev := make([]int, lb+1)
	curr := make([]int, lb+1)
	for j := 0; j <= lb; j++ {
		prev[j] = j
	}
	for i := 1; i <= la; i++ {
		curr[0] = i
		for j := 1; j <= lb; j++ {
			cost := 1
			if ra[i-1] == rb[j-1] {
				cost = 0
			}
			del := prev[j] + 1
			ins := curr[j-1] + 1
			sub := prev[j-1] + cost
			m := del
			if ins < m {
				m = ins
			}
			if sub < m {
				m = sub
			}
			curr[j] = m
		}
		prev, curr = curr, prev
	}
	return prev[lb]
}

func normalizeAlphaNum(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// stripMergedSuffix generates root variants when STT fuses a trailing initial
// like "R" into a name (e.g. "Shambhoor" -> "shambho", "Sambwar" -> "samb", "shampooer" -> "shampoo").
func stripMergedSuffix(norm string) []string {
	out := []string{norm}
	if len([]rune(norm)) < 6 {
		return out
	}
	for _, suf := range []string{"war", "art", "er", "or", "ar", "ur"} {
		if strings.HasSuffix(norm, suf) && len(norm)-len(suf) >= 4 {
			out = append(out, strings.TrimSuffix(norm, suf))
		}
	}
	return out
}

func wordSimilarity(spoken, candidate string) float64 {
	ns := normalizeAlphaNum(spoken)
	nc := normalizeAlphaNum(candidate)
	if ns == "" || nc == "" {
		return 0
	}
	if ns == nc {
		return 1.5
	}

	bestSim := 0.0
	for _, variant := range stripMergedSuffix(ns) {
		maxLen := len([]rune(variant))
		if lc := len([]rune(nc)); lc > maxLen {
			maxLen = lc
		}
		wDist := weightedEditDistance(variant, nc)
		sim := 1.0 - wDist/float64(maxLen)
		if variant != ns {
			sim -= 0.05 // slight preference for unstripped match
		}

		pkS := phoneticKey(variant)
		pkC := phoneticKey(nc)
		if pkS != "" && pkS == pkC {
			sim += 0.35
		} else if pkS != "" && pkC != "" && editDistance(pkS, pkC) <= 1 && maxLen >= 4 {
			sim += 0.18
		}
		if sim > bestSim {
			bestSim = sim
		}
	}
	return bestSim
}

type dictEntry struct {
	original   string
	norm       string
	pk         string
	runeLen    int
	wordCount  int
	isSubEntry bool
}

func buildDictEntries(dictWords []string) (entries []dictEntry, maxWords int) {
	seen := make(map[string]struct{})
	addEntry := func(word string, isSub bool) {
		w := strings.TrimSpace(word)
		if w == "" {
			return
		}
		norm := normalizeAlphaNum(w)
		if norm == "" {
			return
		}
		if _, ok := seen[norm]; ok {
			return
		}
		seen[norm] = struct{}{}
		wc := len(strings.Fields(w))
		if wc > maxWords && !isSub {
			maxWords = wc
		}
		entries = append(entries, dictEntry{
			original:   w,
			norm:       norm,
			pk:         phoneticKey(norm),
			runeLen:    len([]rune(norm)),
			wordCount:  wc,
			isSubEntry: isSub,
		})
	}

	// Add primary entries first so they win over derived sub-words
	for _, w := range dictWords {
		addEntry(w, false)
	}
	// Index individual words (>= 4 chars) inside multi-word dictionary entries
	for _, w := range dictWords {
		parts := strings.Fields(strings.TrimSpace(w))
		if len(parts) <= 1 {
			continue
		}
		for _, p := range parts {
			if len([]rune(normalizeAlphaNum(p))) >= 4 {
				addEntry(p, true)
			}
		}
	}
	if maxWords < 2 {
		maxWords = 2
	} else if maxWords > 4 {
		maxWords = 4
	}
	return entries, maxWords
}

// BuildWhisperInitialPrompt builds a compact, comma-separated bias prompt
// well within Whisper's 224-token ceiling.
func BuildWhisperInitialPrompt(dictWords []string, maxWords int) string {
	if len(dictWords) == 0 || maxWords <= 0 {
		return ""
	}
	var chosen []string
	totalLen := 0
	for _, w := range dictWords {
		w = strings.TrimSpace(w)
		if w == "" {
			continue
		}
		if len(chosen) >= maxWords || totalLen+len(w)+2 > 380 {
			break
		}
		chosen = append(chosen, w)
		totalLen += len(w) + 2
	}
	return strings.Join(chosen, ", ")
}

// SelectRelevantDictionaryWords returns up to maxCandidates dictionary entries
// that best match words or N-word phrases in text, keeping LLM prompts focused.
func SelectRelevantDictionaryWords(text string, dictWords []string, maxCandidates int) []string {
	if len(dictWords) == 0 {
		return nil
	}
	if maxCandidates <= 0 || len(dictWords) <= maxCandidates {
		return dictWords
	}

	rawTokens := strings.Fields(text)
	var windows []string
	for i := range rawTokens {
		joined := ""
		for span := 0; span < 3 && i+span < len(rawTokens); span++ {
			clean := normalizeAlphaNum(rawTokens[i+span])
			if clean == "" {
				break
			}
			joined += clean
			windows = append(windows, joined)
		}
	}

	type scored struct {
		word  string
		score float64
		idx   int
	}
	var results []scored
	for idx, dw := range dictWords {
		dwTrim := strings.TrimSpace(dw)
		if dwTrim == "" {
			continue
		}
		best := 0.0
		for _, w := range windows {
			if s := wordSimilarity(w, dwTrim); s > best {
				best = s
			}
		}
		results = append(results, scored{word: dwTrim, score: best, idx: idx})
	}

	sort.SliceStable(results, func(i, j int) bool {
		if results[i].score != results[j].score {
			return results[i].score > results[j].score
		}
		return results[i].idx < results[j].idx
	})

	var selected []string
	for _, r := range results {
		if len(selected) >= maxCandidates {
			break
		}
		if r.score >= 0.45 || len(selected) < 5 {
			selected = append(selected, r.word)
		}
	}
	return selected
}

type PhoneticHint struct {
	Spoken    string
	Candidate string
}

// FindPhoneticHints identifies tokens in text that phonetically resemble
// dictionary entries (even if STT snapped them to a real English word).
func FindPhoneticHints(text string, dictWords []string, maxHints int) []PhoneticHint {
	if strings.TrimSpace(text) == "" || len(dictWords) == 0 || maxHints <= 0 {
		return nil
	}
	entries, _ := buildDictEntries(dictWords)
	if len(entries) == 0 {
		return nil
	}

	tokens := strings.Fields(text)
	seenSpoken := make(map[string]struct{})
	var hints []PhoneticHint

	for _, tok := range tokens {
		_, core, _ := splitPunctuation(tok)
		norm := normalizeAlphaNum(core)
		if len([]rune(norm)) < 4 {
			continue
		}
		if _, ok := seenSpoken[norm]; ok {
			continue
		}

		bestWord := ""
		bestScore := 0.72
		for _, e := range entries {
			if e.norm == norm {
				bestWord = ""
				break
			}
			if e.runeLen < 4 {
				continue
			}
			sim := wordSimilarity(norm, e.norm)
			if sim > bestScore {
				bestScore = sim
				bestWord = e.original
			}
		}
		if bestWord != "" {
			seenSpoken[norm] = struct{}{}
			hints = append(hints, PhoneticHint{Spoken: core, Candidate: bestWord})
			if len(hints) >= maxHints {
				break
			}
		}
	}
	return hints
}

// FormatDictionaryLLMInstruction builds the dictionary section for LLM system
// prompts, combining top relevant words with explicit phonetic mismatch hints.
func FormatDictionaryLLMInstruction(text string, dictWords []string) string {
	if len(dictWords) == 0 {
		return ""
	}
	relevant := SelectRelevantDictionaryWords(text, dictWords, 18)
	base := fmt.Sprintf("\nHere is a list of custom vocabulary and spelling preferences (names, technical jargon, acronyms) that the user frequently dictates: %s. Prefer using these words when correcting phonetic or spelling errors, and do not treat them as spelling mistakes.", strings.Join(relevant, ", "))

	hints := FindPhoneticHints(text, dictWords, 6)
	if len(hints) > 0 {
		var parts []string
		for _, h := range hints {
			parts = append(parts, fmt.Sprintf("%q -> %q", h.Spoken, h.Candidate))
		}
		base += fmt.Sprintf(" Likely misheard words to consider replacing if they fit the context: %s.", strings.Join(parts, ", "))
	}
	return base
}

func splitPunctuation(token string) (prefix, core, suffix string) {
	runes := []rune(token)
	start := 0
	for start < len(runes) && !unicode.IsLetter(runes[start]) && !unicode.IsDigit(runes[start]) {
		start++
	}
	end := len(runes)
	for end > start && !unicode.IsLetter(runes[end-1]) && !unicode.IsDigit(runes[end-1]) {
		end--
	}
	return string(runes[:start]), string(runes[start:end]), string(runes[end:])
}

func isCommonEnglishWord(norm string) bool {
	_, ok := commonEnglishWords[norm]
	return ok
}

// ApplyExactDictionaryPolish runs after LLM refinement to preserve exact
// dictionary casing and 2-4 word joined brand names (e.g. "Local flow" -> "LocalFlow").
func ApplyExactDictionaryPolish(text string, dictWords []string) string {
	if strings.TrimSpace(text) == "" || len(dictWords) == 0 {
		return text
	}
	entries, maxWords := buildDictEntries(dictWords)
	if len(entries) == 0 {
		return text
	}

	tokens := strings.Fields(text)
	out := make([]string, 0, len(tokens))

	for i := 0; i < len(tokens); i++ {
		matchedSpan := false
		for span := maxWords; span >= 2; span-- {
			if i+span > len(tokens) {
				continue
			}
			pFirst, cFirst, sFirst := splitPunctuation(tokens[i])
			if sFirst != "" || cFirst == "" {
				continue
			}
			joined := normalizeAlphaNum(cFirst)
			validSpan := true
			lastSuffix := ""
			for k := 1; k < span; k++ {
				pk, ck, sk := splitPunctuation(tokens[i+k])
				if pk != "" || ck == "" || (k < span-1 && sk != "") {
					validSpan = false
					break
				}
				joined += normalizeAlphaNum(ck)
				lastSuffix = sk
			}
			if !validSpan {
				continue
			}
			for _, e := range entries {
				if !e.isSubEntry && e.norm == joined {
					out = append(out, pFirst+e.original+lastSuffix)
					i += span - 1
					matchedSpan = true
					break
				}
			}
			if matchedSpan {
				break
			}
		}
		if matchedSpan {
			continue
		}

		prefix, core, suffix := splitPunctuation(tokens[i])
		if core != "" {
			norm := normalizeAlphaNum(core)
			replaced := false
			for _, e := range entries {
				if e.norm == norm {
					out = append(out, prefix+e.original+suffix)
					replaced = true
					break
				}
			}
			if replaced {
				continue
			}
		}
		out = append(out, tokens[i])
	}
	return strings.Join(out, " ")
}

// ApplyPhoneticDictionary applies safe, fast phonetic & fuzzy dictionary
// corrections to raw transcription output (used when LLM refinement is off).
// Supports N-word phrases, merged suffixes, weighted phonetic distance, and
// common-English-word protection.
func ApplyPhoneticDictionary(text string, dictWords []string) string {
	if strings.TrimSpace(text) == "" || len(dictWords) == 0 {
		return text
	}

	entries, maxWords := buildDictEntries(dictWords)
	if len(entries) == 0 {
		return text
	}

	tokens := strings.Fields(text)
	out := make([]string, 0, len(tokens))

	for i := 0; i < len(tokens); i++ {
		// 1. Check N-word windows (from maxWords down to 2)
		matchedSpan := false
		for span := maxWords; span >= 2; span-- {
			if i+span > len(tokens) {
				continue
			}
			pFirst, cFirst, sFirst := splitPunctuation(tokens[i])
			if sFirst != "" || cFirst == "" {
				continue
			}
			joined := normalizeAlphaNum(cFirst)
			validSpan := true
			lastSuffix := ""
			for k := 1; k < span; k++ {
				pk, ck, sk := splitPunctuation(tokens[i+k])
				if pk != "" || ck == "" || (k < span-1 && sk != "") {
					validSpan = false
					break
				}
				joined += normalizeAlphaNum(ck)
				lastSuffix = sk
			}
			if !validSpan {
				continue
			}

			jLen := len([]rune(joined))
			pkJoined := phoneticKey(joined)
			for _, e := range entries {
				if e.isSubEntry {
					continue
				}
				if e.norm == joined {
					out = append(out, pFirst+e.original+lastSuffix)
					i += span - 1
					matchedSpan = true
					break
				}
				if jLen >= 6 && (e.wordCount >= 2 || span == 2) {
					wDist := weightedEditDistance(joined, e.norm)
					if (pkJoined != "" && pkJoined == e.pk && wDist <= 2.5) || wDist <= 1.5 {
						out = append(out, pFirst+e.original+lastSuffix)
						i += span - 1
						matchedSpan = true
						break
					}
				}
			}
			if matchedSpan {
				break
			}
		}
		if matchedSpan {
			continue
		}

		// 2. Single-token match
		prefix, core, suffix := splitPunctuation(tokens[i])
		if core == "" {
			out = append(out, tokens[i])
			continue
		}

		normCore := normalizeAlphaNum(core)
		coreLen := len([]rune(normCore))
		commonWord := isCommonEnglishWord(normCore)

		bestWord := ""
		bestScore := 0.0

		for _, e := range entries {
			// Exact normalized match -> always enforce dictionary casing
			if normCore == e.norm {
				bestWord = e.original
				bestScore = 2.0
				break
			}
			// Guard common English words & short words from blind fuzzy overwrite
			if commonWord || coreLen <= 3 || e.runeLen <= 3 {
				continue
			}

			for _, variant := range stripMergedSuffix(normCore) {
				vLen := len([]rune(variant))
				pkVar := phoneticKey(variant)
				wDist := weightedEditDistance(variant, e.norm)
				phoneticMatch := pkVar != "" && pkVar == e.pk
				nearPhonetic := pkVar != "" && e.pk != "" && editDistance(pkVar, e.pk) <= 1

				if (phoneticMatch && wDist <= 2.2) || (nearPhonetic && vLen >= 5 && wDist <= 1.8) || (vLen >= 5 && wDist <= 1.2) {
					score := wordSimilarity(normCore, e.norm)
					if score > bestScore {
						bestScore = score
						bestWord = e.original
					}
				}
			}
		}

		if bestWord != "" {
			out = append(out, prefix+bestWord+suffix)
		} else {
			out = append(out, tokens[i])
		}
	}

	return strings.Join(out, " ")
}
