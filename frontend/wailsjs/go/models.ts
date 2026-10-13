export namespace main {
	
	export class Analytics {
	    timestamp: string;
	    duration_ms: number;
	    word_count: number;
	
	    static createFrom(source: any = {}) {
	        return new Analytics(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.timestamp = source["timestamp"];
	        this.duration_ms = source["duration_ms"];
	        this.word_count = source["word_count"];
	    }
	}
	export class Config {
	    input_boost_enabled: boolean;
	    input_boost_gain: number;
	    keybind1_rawcode: number;
	    keybind2_rawcode: number;
	    keybind1_name: string;
	    keybind2_name: string;
	    start_on_startup: boolean;
	    start_minimized: boolean;
	    keybind_capture_active: boolean;
	    audio_retention_days: number;
	    transcription_retention_days: number;
	    active_microphone: string;
	    data_folder: string;
	    active_model: string;
	    processing_engine: string;
	    selected_gpu: string;
	    llm_enabled: boolean;
	    llm_active_model: string;
	    llm_refinement_mode: string;
	    llm_tone: string;
	    llm_context_size: number;
	    llm_enable_thinking: boolean;
	    manglish_enabled: boolean;
	    manglish_example_1: string;
	    manglish_example_2: string;
	    manglish_example_3: string;
	    manglish_example_4: string;
	    manglish_example_5: string;
	    bilingual_routing_enabled: boolean;
	    bilingual_whisper_model: string;
	    bilingual_conformer_model: string;
	    meeting_model: string;
	    meeting_bilingual: boolean;
	    meeting_llm_model: string;
	    window_width: number;
	    window_height: number;
	    window_maximized: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.input_boost_enabled = source["input_boost_enabled"];
	        this.input_boost_gain = source["input_boost_gain"];
	        this.keybind1_rawcode = source["keybind1_rawcode"];
	        this.keybind2_rawcode = source["keybind2_rawcode"];
	        this.keybind1_name = source["keybind1_name"];
	        this.keybind2_name = source["keybind2_name"];
	        this.start_on_startup = source["start_on_startup"];
	        this.start_minimized = source["start_minimized"];
	        this.keybind_capture_active = source["keybind_capture_active"];
	        this.audio_retention_days = source["audio_retention_days"];
	        this.transcription_retention_days = source["transcription_retention_days"];
	        this.active_microphone = source["active_microphone"];
	        this.data_folder = source["data_folder"];
	        this.active_model = source["active_model"];
	        this.processing_engine = source["processing_engine"];
	        this.selected_gpu = source["selected_gpu"];
	        this.llm_enabled = source["llm_enabled"];
	        this.llm_active_model = source["llm_active_model"];
	        this.llm_refinement_mode = source["llm_refinement_mode"];
	        this.llm_tone = source["llm_tone"];
	        this.llm_context_size = source["llm_context_size"];
	        this.llm_enable_thinking = source["llm_enable_thinking"];
	        this.manglish_enabled = source["manglish_enabled"];
	        this.manglish_example_1 = source["manglish_example_1"];
	        this.manglish_example_2 = source["manglish_example_2"];
	        this.manglish_example_3 = source["manglish_example_3"];
	        this.manglish_example_4 = source["manglish_example_4"];
	        this.manglish_example_5 = source["manglish_example_5"];
	        this.bilingual_routing_enabled = source["bilingual_routing_enabled"];
	        this.bilingual_whisper_model = source["bilingual_whisper_model"];
	        this.bilingual_conformer_model = source["bilingual_conformer_model"];
	        this.meeting_model = source["meeting_model"];
	        this.meeting_bilingual = source["meeting_bilingual"];
	        this.meeting_llm_model = source["meeting_llm_model"];
	        this.window_width = source["window_width"];
	        this.window_height = source["window_height"];
	        this.window_maximized = source["window_maximized"];
	    }
	}
	export class DetectedBrowser {
	    id: string;
	    name: string;
	    path: string;
	    installed: boolean;
	    url: string;
	
	    static createFrom(source: any = {}) {
	        return new DetectedBrowser(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.path = source["path"];
	        this.installed = source["installed"];
	        this.url = source["url"];
	    }
	}
	export class Meeting {
	    id: string;
	    title: string;
	    created_at: string;
	    duration_seconds: number;
	    audio_path: string;
	    summary_markdown: string;
	    short_summary: string;
	    full_transcript: string;
	
	    static createFrom(source: any = {}) {
	        return new Meeting(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.created_at = source["created_at"];
	        this.duration_seconds = source["duration_seconds"];
	        this.audio_path = source["audio_path"];
	        this.summary_markdown = source["summary_markdown"];
	        this.short_summary = source["short_summary"];
	        this.full_transcript = source["full_transcript"];
	    }
	}
	export class MeetingSegment {
	    id: number;
	    meeting_id: string;
	    speaker: string;
	    start_ms: number;
	    end_ms: number;
	    text: string;
	    language: string;
	
	    static createFrom(source: any = {}) {
	        return new MeetingSegment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.meeting_id = source["meeting_id"];
	        this.speaker = source["speaker"];
	        this.start_ms = source["start_ms"];
	        this.end_ms = source["end_ms"];
	        this.text = source["text"];
	        this.language = source["language"];
	    }
	}
	export class MeetingDetail {
	    meeting: Meeting;
	    segments: MeetingSegment[];
	
	    static createFrom(source: any = {}) {
	        return new MeetingDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.meeting = this.convertValues(source["meeting"], Meeting);
	        this.segments = this.convertValues(source["segments"], MeetingSegment);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ModelStatus {
	    id: string;
	    name: string;
	    filename: string;
	    size_mb: number;
	    speed_label: string;
	    speed_description: string;
	    description: string;
	    is_downloaded: boolean;
	    is_active: boolean;
	    is_downloading: boolean;
	    download_progress: number;
	    language: string;
	    model_type: string;
	    is_disabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ModelStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.filename = source["filename"];
	        this.size_mb = source["size_mb"];
	        this.speed_label = source["speed_label"];
	        this.speed_description = source["speed_description"];
	        this.description = source["description"];
	        this.is_downloaded = source["is_downloaded"];
	        this.is_active = source["is_active"];
	        this.is_downloading = source["is_downloading"];
	        this.download_progress = source["download_progress"];
	        this.language = source["language"];
	        this.model_type = source["model_type"];
	        this.is_disabled = source["is_disabled"];
	    }
	}
	export class Recording {
	    id: number;
	    filename: string;
	    timestamp: string;
	    duration_ms: number;
	    transcription: string;
	    raw_transcription: string;
	    word_count: number;
	    transcription_time_us: number;
	
	    static createFrom(source: any = {}) {
	        return new Recording(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.filename = source["filename"];
	        this.timestamp = source["timestamp"];
	        this.duration_ms = source["duration_ms"];
	        this.transcription = source["transcription"];
	        this.raw_transcription = source["raw_transcription"];
	        this.word_count = source["word_count"];
	        this.transcription_time_us = source["transcription_time_us"];
	    }
	}
	export class UpdateState {
	    status: string;
	    version: string;
	    percent: number;
	
	    static createFrom(source: any = {}) {
	        return new UpdateState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.version = source["version"];
	        this.percent = source["percent"];
	    }
	}
	export class WordMapping {
	    malayalam: string;
	    translit: string;
	
	    static createFrom(source: any = {}) {
	        return new WordMapping(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.malayalam = source["malayalam"];
	        this.translit = source["translit"];
	    }
	}

}

