package main

import (
	"reflect"
	"strings"
	"testing"
)

func TestDictPhoneticAndFuzzyMatcher(t *testing.T) {
	dict := []string{"Sambhu", "Amoxicillin", "LocalFlow", "Paracetamol", "Kubernetes", "Karthik"}

	cases := []struct {
		in   string
		want string
	}{
		{"Hello Sambu, how are you?", "Hello Sambhu, how are you?"},
		{"Hello Shampu, how are you?", "Hello Sambhu, how are you?"},
		{"Karthik Shambhoor.", "Karthik Sambhu."},
		{"Cartie and Sambu.", "Karthik and Sambhu."},
		{"Take amoxacillin twice daily.", "Take Amoxicillin twice daily."},
		{"I am building Local flow today.", "I am building LocalFlow today."},
		{"Prescribe paracetmol 500mg.", "Prescribe Paracetamol 500mg."},
		{"Deploy to kubernetis cluster.", "Deploy to Kubernetes cluster."},
		// Common English words and short words must not be corrupted
		{"It is a cat on the mat.", "It is a cat on the mat."},
		{"Leave a comment on the code.", "Leave a comment on the code."},
		{"I was showering with shampoo in my head.", "I was showering with shampoo in my head."},
	}

	for _, tc := range cases {
		got := ApplyPhoneticDictionary(tc.in, dict)
		if got != tc.want {
			t.Errorf("ApplyPhoneticDictionary(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestDictMultiWordPhraseAndSubWord(t *testing.T) {
	dict := []string{"Karthik Sambhu R", "LocalFlow"}

	gotPhrase := ApplyPhoneticDictionary("Hello Karthik Shambhu R today.", dict)
	if gotPhrase != "Hello Karthik Sambhu R today." {
		t.Errorf("expected 3-word phrase match, got %q", gotPhrase)
	}

	gotSub := ApplyPhoneticDictionary("Hello Shambu.", dict)
	if gotSub != "Hello Sambhu." {
		t.Errorf("expected sub-word match from multi-word entry, got %q", gotSub)
	}
}

func TestDictHintsAndInitialPrompt(t *testing.T) {
	dict := []string{"LocalFlow", "Sambhu", "Karthik"}

	instr := FormatDictionaryLLMInstruction("Cartie shampooer.", dict)
	if !strings.Contains(instr, `"Cartie" -> "Karthik"`) {
		t.Errorf("expected Cartie -> Karthik hint, got %q", instr)
	}

	prompt := BuildWhisperInitialPrompt(dict, 20)
	if prompt != "LocalFlow, Sambhu, Karthik" {
		t.Errorf("unexpected initial prompt: %q", prompt)
	}
}

func TestDictExactPolishAfterLLM(t *testing.T) {
	dict := []string{"LocalFlow", "Sambhu"}
	got := ApplyExactDictionaryPolish("I love local flow and sambhu.", dict)
	if got != "I love LocalFlow and Sambhu." {
		t.Errorf("ApplyExactDictionaryPolish = %q", got)
	}
}

func TestDictSelectRelevantCandidates(t *testing.T) {
	var largeDict []string
	for i := 0; i < 40; i++ {
		largeDict = append(largeDict, "UnrelatedTerm"+string(rune('A'+i%26)))
	}
	largeDict = append(largeDict, "Sambhu", "Amoxicillin")

	got := SelectRelevantDictionaryWords("Please send amoxacillin to Sambu.", largeDict, 10)
	if len(got) > 10 {
		t.Fatalf("expected at most 10 candidates, got %d", len(got))
	}

	hasSambhu := false
	hasAmox := false
	for _, w := range got {
		if w == "Sambhu" {
			hasSambhu = true
		}
		if w == "Amoxicillin" {
			hasAmox = true
		}
	}
	if !hasSambhu || !hasAmox {
		t.Errorf("expected Sambhu and Amoxicillin in top candidates, got %v", got)
	}

	small := []string{"Alpha", "Beta"}
	if gotSmall := SelectRelevantDictionaryWords("hello", small, 10); !reflect.DeepEqual(gotSmall, small) {
		t.Errorf("expected small dict unchanged, got %v", gotSmall)
	}
}
