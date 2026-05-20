const STORAGE_KEY = 'itProjectExamAnswersV3';

function shuffle(array) {
    const copy = [...array];

    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }

    return copy;
}

const shuffledQuestions = shuffle(QUESTIONS);

let state = {
    answers: createInitialAnswers(),
    submitted: false,
    score: 0,
};

function createInitialAnswers() {
    return QUESTIONS.reduce((answers, q) => {
        if (q.type === 'multiple') answers[q.id] = [];
        else if (q.type === 'order') answers[q.id] = [...q.initial];
        else if (q.type === 'text') answers[q.id] = '';
        else answers[q.id] = null;

        return answers;
    }, {});
}

function normalizeLoadedAnswers(savedAnswers) {
    if (!savedAnswers) return null;

    if (Array.isArray(savedAnswers)) {
        return QUESTIONS.reduce((answers, q, index) => {
            answers[q.id] = savedAnswers[index];
            return answers;
        }, createInitialAnswers());
    }

    if (typeof savedAnswers === 'object') {
        return QUESTIONS.reduce((answers, q) => {
            if (Object.prototype.hasOwnProperty.call(savedAnswers, q.id)) {
                answers[q.id] = savedAnswers[q.id];
            }

            return answers;
        }, createInitialAnswers());
    }

    return null;
}

function loadState() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        const answers = normalizeLoadedAnswers(saved?.answers);

        if (saved && answers) {
            state = { ...state, ...saved, answers };
        }
    } catch (e) {}
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function sameSet(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    const left = [...a].map(Number).sort((x, y) => x - y);
    const right = [...b].map(Number).sort((x, y) => x - y);
    return left.every((value, idx) => value === right[idx]);
}

function sameOrder(a, b) {
    return Array.isArray(a)
        && Array.isArray(b)
        && a.length === b.length
        && a.every((value, index) => value === b[index]);
}

function normalizeTextAnswer(value) {
    return String(value ?? '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^0-9a-zа-я]+/g, '');
}

function getAnswer(question) {
    return state.answers[question.id];
}

function setAnswer(question, value) {
    state.answers[question.id] = value;
}

function isAnswered(question) {
    const answer = getAnswer(question);

    if (question.type === 'multiple') return Array.isArray(answer) && answer.length > 0;
    if (question.type === 'order') return !sameOrder(answer, question.initial);
    if (question.type === 'text') return String(answer || '').trim().length > 0;

    return answer !== null && answer !== undefined;
}

function isCorrect(question, answer) {
    if (question.type === 'single') return answer === question.correct;
    if (question.type === 'multiple') return sameSet(answer, question.correct);
    if (question.type === 'order') return Array.isArray(answer) && answer.every((itemIndex, position) => itemIndex === position);
    if (question.type === 'text') {
        const normalizedAnswer = normalizeTextAnswer(answer);
        const accepted = question.accepted?.length ? question.accepted : [question.answer];
        return normalizedAnswer.length > 0 && accepted.some(value => normalizeTextAnswer(value) === normalizedAnswer);
    }
    return false;
}

function scoreQuiz() {
    return QUESTIONS.reduce((sum, question) => sum + (isCorrect(question, getAnswer(question)) ? 1 : 0), 0);
}

function typeLabel(type) {
    return { single: 'один ответ', multiple: 'несколько ответов', text: 'ввод ответа', order: 'порядок' }[type] || type;
}

function renderOptions(question, index) {
    const qId = question.id;

    if (question.type === 'order') {
        const order = getAnswer(question) || question.initial;
        return `<ol class="order-list">${order.map((itemIndex, position) => `
            <li class="order-item" draggable="true" data-qid="${qId}" data-pos="${position}">
                <span class="handle">↕</span>
                <span class="marker">${position + 1}</span>
                <span>${escapeHtml(question.items[itemIndex])}</span>
            </li>
        `).join('')}</ol>`;
    }

    if (question.type === 'text') {
        const answer = getAnswer(question) || '';
        return `<label class="text-answer-shell">
            <input class="text-answer" type="text" data-qid="${qId}" value="${escapeHtml(answer)}" placeholder="Введите ответ">
        </label>`;
    }

    const answer = getAnswer(question);

    return question.options.map((option, optionIndex) => {
        const selected = question.type === 'multiple'
            ? Array.isArray(answer) && answer.includes(optionIndex)
            : answer === optionIndex;

        const marker = question.type === 'multiple'
            ? (selected ? '✓' : '□')
            : String.fromCharCode(65 + optionIndex);

        return `<div class="option ${selected ? 'selected' : ''}" data-qid="${qId}" data-opt="${optionIndex}">
            <span class="marker">${marker}</span>
            <span>${escapeHtml(option)}</span>
        </div>`;
    }).join('');
}

function correctAnswerText(question) {
    if (question.type === 'single') return question.options[question.correct];
    if (question.type === 'multiple') return question.correct.map(i => question.options[i]).join('; ');
    if (question.type === 'order') return question.items.join(' → ');
    if (question.type === 'text') return question.answer || (question.accepted || []).join(' / ');
    return '';
}

function renderQuestion(question, index) {
    const correct = state.submitted ? isCorrect(question, getAnswer(question)) : null;

    return `<section class="card question-card" id="q-${index}">
        <div class="question-head">
            <div class="question-title">${index + 1}. ${escapeHtml(question.question)}</div>
            <div class="badges"><span class="badge">№ ${question.id}</span><span class="badge">${typeLabel(question.type)}</span></div>
        </div>
        ${renderOptions(question, index)}
        ${state.submitted ? `<div class="answer-state ${correct ? 'correct' : 'wrong'}">${correct ? 'Верно' : 'Неверно'}</div><div class="reveal">Правильный ответ: ${escapeHtml(correctAnswerText(question))}</div>` : ''}
    </section>`;
}

function render() {
    const answered = shuffledQuestions.filter(isAnswered).length;
    const percent = Math.round((answered / shuffledQuestions.length) * 100);
    const result = state.submitted
        ? Math.round((state.score / shuffledQuestions.length) * 100)
        : null;

    document.getElementById('app').innerHTML = `<div class="container">
        <div class="card hero">
            <h1>Тест по управлению IT-проектами</h1>

            <p>
                Отвечайте на вопросы по материалам экзаменационного списка.
                В заданиях с несколькими ответами засчитывается только полный набор правильных вариантов,
                а текстовые ответы проверяются без учета регистра и лишних знаков.
            </p>

            <div class="stats-grid">
                <div class="stat">
                    <span>Вопросов</span>
                    <strong>${shuffledQuestions.length}</strong>
                </div>

                <div class="stat">
                    <span>Отвечено</span>
                    <strong>${answered}</strong>
                </div>

                <div class="stat">
                    <span>Типы</span>
                    <strong>
                        ${META.types.single || 0}/${META.types.multiple || 0}/${META.types.text || 0}/${META.types.order || 0}
                    </strong>
                </div>

                <div class="stat">
                    <span>Результат</span>
                    <strong>${state.submitted ? result + '%' : '—'}</strong>
                </div>
            </div>

            <div class="progress-line">
                <div class="progress-fill" style="width:${percent}%"></div>
            </div>

            <div class="toolbar">
                <button class="btn" id="submitQuiz">Завершить тест</button>
                <button class="btn-secondary btn" id="resetQuiz">Сбросить ответы</button>
                <button class="btn-outline btn" id="scrollFirst">К первому вопросу</button>
            </div>
        </div>

        ${shuffledQuestions.map(renderQuestion).join('')}

        ${
            state.submitted
                ? `<div class="card result-panel">
                    <strong>Итог:</strong> ${state.score} из ${shuffledQuestions.length} (${result}%).
                   </div>`
                : ''
        }
    </div>`;

    attachHandlers();
}

function findQuestionById(qId) {
    return QUESTIONS.find(question => question.id === qId);
}

function attachHandlers() {
    document.querySelectorAll('.option').forEach(option => {
        option.addEventListener('click', () => {
            const qId = Number(option.dataset.qid);
            const optionIndex = Number(option.dataset.opt);
            const question = findQuestionById(qId);

            if (!question) return;

            state.submitted = false;

            if (question.type === 'multiple') {
                const current = Array.isArray(getAnswer(question)) ? [...getAnswer(question)] : [];
                setAnswer(question, current.includes(optionIndex)
                    ? current.filter(i => i !== optionIndex)
                    : [...current, optionIndex]
                );
            } else {
                setAnswer(question, optionIndex);
            }

            saveState();
            render();
        });
    });

    document.querySelectorAll('.text-answer').forEach(input => {
        input.addEventListener('input', () => {
			const qId = Number(input.dataset.qid);
			const question = findQuestionById(qId);

			if (!question) return;

			setAnswer(question, input.value);
			state.submitted = false;
			saveState();
		});
    });

    let dragged = null;

    document.querySelectorAll('.order-item').forEach(item => {
        item.addEventListener('dragstart', event => {
            dragged = {
                qId: Number(item.dataset.qid),
                position: Number(item.dataset.pos)
            };

            event.dataTransfer.setData('text/plain', `${dragged.qId}:${dragged.position}`);
        });

        item.addEventListener('dragover', event => event.preventDefault());

        item.addEventListener('drop', event => {
            event.preventDefault();

            const target = {
                qId: Number(item.dataset.qid),
                position: Number(item.dataset.pos)
            };

            const question = findQuestionById(target.qId);

            if (!question || !dragged || dragged.qId !== target.qId || dragged.position === target.position) return;

            const order = [...getAnswer(question)];
            const [moved] = order.splice(dragged.position, 1);
            order.splice(target.position, 0, moved);

            setAnswer(question, order);
            state.submitted = false;
            saveState();
            render();
        });
    });
	
	document.getElementById('submitQuizNew')?.addEventListener('click', () => {
        state.score = scoreQuiz();
        state.submitted = true;
        saveState();
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.getElementById('resetQuizNew')?.addEventListener('click', () => {
        state = {
            answers: createInitialAnswers(),
            submitted: false,
            score: 0
        };

        saveState();
        render();
    });

    document.getElementById('scrollFirstNew')?.addEventListener('click', () => {
        document.getElementById('q-0')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    });

    document.getElementById('submitQuiz')?.addEventListener('click', () => {
        state.score = scoreQuiz();
        state.submitted = true;
        saveState();
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.getElementById('resetQuiz')?.addEventListener('click', () => {
        state = {
            answers: createInitialAnswers(),
            submitted: false,
            score: 0
        };

        saveState();
        render();
    });

    document.getElementById('scrollFirst')?.addEventListener('click', () => {
        document.getElementById('q-0')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    });
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

loadState();
render();
