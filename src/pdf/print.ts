export class PrintProfile{
    max:number;
    paper_size:string;
    font_size:number;
    note_font_size:number;
    lines_per_page:number;
    top_margin:number;
    page_width:number;
    page_height:number;
    left_margin:number;
    right_margin:number;
    font_width:number;
    font_height:number;
    note_line_height:number;
    line_spacing:number;
    page_number_top_margin:number;
    dual_max_factor:number;
    title_page:{
        top_start:number;
        left_side:string[];
        right_side:string[];
    };
    scene_heading:{feed:number;max:number;};
    action:{feed:number;max:number;};
    shot:{feed:number;max:number;};
    character:{feed:number;max:number;};
    parenthetical:{feed:number;max:number;};
    more:{feed:number;max:number;};
    dialogue:{feed:number;max:number;feed_double:number;};
    transition:{feed:number;max:number;};
    centered:{feed:number;max:number;style:string};
    synopsis:{feed:number;max:number;italic:boolean;color:string;padding:number;feed_with_last_section:boolean};
    section:{feed:number;max:number;color:string;level_indent:number;};
    note:{color:string;italic:boolean;}
}

var A4_DEFAULT_MAX = 57,
    US_DEFAULT_MAX = 61,
    CN_DEFAULT_MAX = 60;

    export var print_profiles:{ [key: string]: PrintProfile } = {
        "a4": {
            max: A4_DEFAULT_MAX,
            paper_size: "a4",
            font_size: 12,
            note_font_size: 9,
            lines_per_page: 57,
            top_margin: 1.2,
            page_width: 8.2,
            page_height: 11.7,
            left_margin: 1,
            right_margin: 1,
            font_width: 0.1,
            font_height: 0.1667,
            note_line_height: 0.1667,
            line_spacing: 1,
            page_number_top_margin: 0.5,
            dual_max_factor: 0.75,
            title_page: {
                top_start: 3.5,
                left_side: ['notes', 'copyright'],
                right_side: ['draft_date', 'date', 'contact', 'contact_info', 'revision']
            },
            scene_heading: {
                feed: 1.5,
                max: A4_DEFAULT_MAX
            },
            action: {
                feed: 1.5,
                max: A4_DEFAULT_MAX
            },
            shot: {
                feed: 1.5,
                max: A4_DEFAULT_MAX
            },
            character: {
                feed: 3.5,
                max: 33
            },
            more: {
                feed: 3.5,
                max: 33
            },
            parenthetical: {
                feed: 3,
                max: 26
            },
            dialogue: {
                feed: 2.5,
                max: 36,
                feed_double: 1.9,
            },
            transition: {
                feed: 0.0,
                max: A4_DEFAULT_MAX
            },
            centered: {
                feed: 1.5,
                style: 'center',
                max: A4_DEFAULT_MAX
            },
            synopsis: {
                feed: 0.5,
                max: A4_DEFAULT_MAX,
                italic: true,
                color: '#888888',
                padding: 0,
                feed_with_last_section: true
            },
            section: {
                feed: 0.5,
                max: A4_DEFAULT_MAX,
                color: '#555555',
                level_indent: 0.2
            },
            note: {
                color: '#888888',
                italic: true
            }
        },
        "中文a4": {
            max: CN_DEFAULT_MAX,
            paper_size: "a4",
            font_size: 12,
            note_font_size: 9,
            lines_per_page: 41,
            top_margin: 1.1,
            page_width: 8.2,
            page_height: 11.6,
            left_margin: 0.5,
            right_margin: 0.5,
            font_width: 0.1,
            font_height: 0.23,
            note_line_height: 0.17,
            line_spacing: 1,
            page_number_top_margin: 0.4,
            dual_max_factor: 0.75,
            title_page: {
                top_start: 3.5,
                left_side: ['notes', 'copyright'],
                right_side: ['draft_date', 'date', 'contact', 'contact_info', 'revision']
            },
            scene_heading: {
                feed: 1.2,
                max: CN_DEFAULT_MAX
            },
            action: {
                feed: 1.2,
                max: CN_DEFAULT_MAX
            },
            shot: {
                feed: 1.0,
                max: CN_DEFAULT_MAX
            },
            character: {
                feed: 3,
                max: 28
            },
            more: {
                feed: 3,
                max: 28
            },
            parenthetical: {
                feed: 2.5,
                max: 33
            },
            dialogue: {
                feed: 2.2,
                max: 40,
                feed_double: 1.4,
            },
            transition: {
                feed: 0.0,
                max: CN_DEFAULT_MAX
            },
            centered: {
                feed: 0.5,
                style: 'center',
                max: CN_DEFAULT_MAX
            },
            synopsis: {
                feed: 0.2,
                max: CN_DEFAULT_MAX,
                italic: true,
                color: '#888888',
                padding: 0,
                feed_with_last_section: true
            },
            section: {
                feed: 0.2,
                max: CN_DEFAULT_MAX,
                color: '#555555',
                level_indent: 0.2
            },
            note: {
                color: '#888888',
                italic: true
            }
        }
    }
print_profiles.usletter = JSON.parse(JSON.stringify(print_profiles.a4));
var letter = print_profiles.usletter;
letter.paper_size = 'letter';
letter.lines_per_page = 55;
letter.page_width = 8.5;
letter.page_height = 11;

letter.scene_heading.max = US_DEFAULT_MAX;
letter.action.max = US_DEFAULT_MAX;
letter.shot.max = US_DEFAULT_MAX;
letter.transition.max = US_DEFAULT_MAX;
letter.section.max = US_DEFAULT_MAX;
letter.synopsis.max = US_DEFAULT_MAX;

export default print_profiles;