const path = require("path");
const fs = require('fs');
const MarkdownIt = require('markdown-it');
const {headers, excluded} = require("./headers");
const replacements = require("./replacements");

const md = new MarkdownIt();

const DOCS_DIR = "/docs/docs";

function loadFile(filename, faq) {
    let data = fs.readFileSync(filename).toString();

    data = data.toString();
    let separateLines = data.split(/\r?\n|\r|\n/g);
    let question = "";
    let answer = [];
    for (let i = 0; i < separateLines.length; i++) {
        let line = separateLines[i];
        if (!line.length || ['<hr class="subsection" />', '<hr class="subsection"/>'].includes(line))
            continue;
        if (line.startsWith('[<span class="typedoc-icon')){
            continue;
        }

        // hide tip tag
        line = line.replace(":::tip", "");
        line = line.replace(":::", "");

        // new header or end of the file
        if (line.startsWith('## ') || line.startsWith('### ') || i === separateLines.length - 1) {
            if (question && answer.length > 0) {
                // removing last spacer
                if (answer[answer.length - 1] === '---') {
                    answer.pop();
                }
                // adding last line
                if (i === separateLines.length - 1)
                    answer.push(line);

                if (excluded.includes(getHeaderWithoutLinkParameter(question))) {
                    //console.log("excluded " + question);
                    continue;
                }
                const linkParameter = getLinkParameter(question);
                question = getQuestion(question);

                let unique_questions = [];
                faq.map(item => {
                    if(!unique_questions.includes(item.q_text)){
                        unique_questions.push(item.q_text)
                    }
                });

                let result = null;
                if (Object.keys(replacements).includes(question)) {
                    result = replacements[question];
                }
                else {
                    result = {
                        "q": md.render(question),
                        "a": getAnswer(md.render(clearAnswer(answer.join("\n"))),
                            filename + linkParameter,
                        ),
                        "q_text": question,
                    };
                }

                if (unique_questions.includes(result.q_text)){
                    // TODO: merge 2 answers?
                    console.log(`Duplicated question: ${question}`)
                }
                else {
                    faq.push(result);
                }

                answer = [];
                question = "";
            }

            question = line.substr(line.indexOf(" ")).trim();
        } else {
            if (question)
                answer.push(line);
        }
    }
    return faq;
}

let faq = [];

// test local file
//loadFile("/Users/alice/projects/near-docs-faq/docs/docs/1.concepts/storage/storage-staking.md", faq);
//console.log(faq); return;

let files = findByExtension(__dirname + DOCS_DIR, "md");

files.map(file => loadFile(file, faq));


let html = faq.map(item => formatHtmlItem(item.q, item.a)).join("<hr />\n");

let csvRows = faq.map(item => [item.q_text, item.a]);
exportToCsv("faq.csv", csvRows);

fs.writeFile("faq.html", readFaqTemplate().replace("</body>", `${html}</body>`), function (err) {
    if (err) throw err;
    console.log('File is created successfully.');
});


// test local file
//loadFile(__dirname + DOCS_DIR + "/2.develop/deploy.md", faq);
//let t = readFaqTemplate();
//console.log(faq);

return;
loadFile("/Users/alice/projects/near-docs-faq/docs/docs/1.concepts/basics/accounts/access-keys.md");
return;

function formatHtmlItem(question, answer) {
    if (!question || !answer)
        return "";

    return `
<div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question" class="item">
        <h2 itemprop="name" class="question">${question}</h2>
        <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer" class="answer">
            <div itemprop="text">${answer}</p>
        </div>
    </div>
</div>`
}

function readFaqTemplate() {
    return fs.readFileSync(__dirname + "/faq_template.html").toString();
}

function getQuestion(question) {
    question = getHeaderWithoutLinkParameter(question);
    if (Object.keys(headers).includes(question)) {
        return headers[question];
    } else {
        if (!question.endsWith("?")) {
            question = `What ${question.toLowerCase().endsWith("s") ? "are" : "is"} ${question.toLowerCase().startsWith("the") ? "" : "the"} ${question}?`;
        }
        return question;
    }
}

function clearAnswer(answer) {
    answer = answer.replace(`---
>Got a question?
<a href="https://stackoverflow.com/questions/tagged/nearprotocol">
  <h8>Ask it on StackOverflow!</h8>
</a>`, "");

    answer = answer.replace(`<blockquote>
Got a question?
<a href="https://stackoverflow.com/questions/tagged/nearprotocol"> > <h8>Ask it on StackOverflow!</h8></a>
</blockquote>`, "");

    return answer;
}

function getAnswer(answer, filename) {
    filename = filename.replace(__dirname + DOCS_DIR, "");
    answer += `<p><a href="${filename}">Read more...</a></p>`;
    answer = FixLinks(answer, filename);

    answer = answer.replace('<img src="/docs/assets/', '<img src="https://docs.near.org/docs/assets/');

    return answer;
}

function FixLinks(answer, filename) {
    let documentBasePath = path.dirname(filename)
        // remove url prefix
        .replace(/([..\/]+[0-9]+.)/gm, "https://docs.near.org/");

    return answer
        // remove url prefix
        .replace(/(href\s*=\s*['"])([..\/]+[0-9]+.)/gm, "$1https://docs.near.org/")
        // make links absolute
        .replace(/(href=['"](?!http:?|https?:))\/?([#.\/\-a-z]+)/mg, `$1${documentBasePath}/$2`)
        // remove .md extension
        .replace(/(href\s*=\s*['"].+)(.md)/gm, "$1")
        // tools/cli -> tools/near-cli
        .replace(/(href\s*=\s*['"][..\/]?.+)(tools\/cli)/gm, "$1tools/near-cli")
        // smartcontracts/smartcontract -> smartcontracts/smartcontracts
        .replace(/(href\s*=\s*['"][..\/]?.+)(smartcontracts\/smartcontract)/gm, "$1smartcontracts/smartcontracts");
    ;
}

function getLinkParameter(header) {
    let match = /{(#.+)}/gm.exec(header);
    return (match || []).length ? match[1] : "";

}

function getHeaderWithoutLinkParameter(question) {
    return question.replace(`{${getLinkParameter(question)}}`, "").trim();
}

function exportToCsv(filename, rows) {
    var processRow = function (row) {
        var finalVal = '';
        for (var j = 0; j < row.length; j++) {
            var innerValue = row[j] === null ? '' : row[j].toString();
            if (row[j] instanceof Date) {
                innerValue = row[j].toLocaleString();
            };
            // screen quotes
            let result = innerValue.replace(/"/g, '""');
            // remove linebreaks
            result = result.replace(/(\r\n|\n|\r)/gm, " ");

            result = '"' + result + '"';

            if (j > 0)
                finalVal += ',';

            finalVal += result;
        }
        return finalVal + '\n';
    };

    var csvFile = '';
    for (var i = 0; i < rows.length; i++) {
        csvFile += processRow(rows[i]);
    }

    fs.writeFile(filename, csvFile, function (err) {
        if (err) throw err;
        console.log('CSV File is created successfully.');
    });
    return;

    var blob = new Blob([csvFile], { type: 'text/csv;charset=utf-8;' });
    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, filename);
    } else {
        var link = document.createElement("a");
        if (link.download !== undefined) { // feature detection
            // Browsers that support HTML5 download attribute
            var url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
}

function findByExtension(dir, ext) {
    let files = [];
    const items = fs.readdirSync(dir, {withFileTypes: true});

    for (const item of items) {
        if (item.name.includes("0.old")) {
            continue;
        }

        if (item.isDirectory()) {
            files = [...files, ...findByExtension(`${dir}/${item.name}`, ext)];
        } else {
            const fileExt = path.extname(item.name);

            if (fileExt === `.${ext}`) {
                files.push(`${dir}/${item.name}`);
            }
        }
    }

    return files;
};

