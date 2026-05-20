const STORAGE_KEY = 'itProjectExamAnswersV2';
let state = {
    answers: createInitialAnswers(),
    submitted: false,
    score: 0,
};

function createInitialAnswers() {
    return QUESTIONS.map(q => {
        if (q.type === 'multiple') return [];
        if (q.type === 'order') return [...q.initial];
        if (q.type === 'text') return '';
        return null;
    });
}

function loadState() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved && Array.isArray(saved.answers) && saved.answers.length === QUESTIONS.length) {
            state = { ...state, ...saved };
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

function normalizeTextAnswer(value) {
    return String(value ?? '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^0-9a-zа-я]+/g, '');
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
    return QUESTIONS.reduce((sum, question, idx) => sum + (isCorrect(question, state.answers[idx]) ? 1 : 0), 0);
}

function typeLabel(type) {
    return { single: 'один ответ', multiple: 'несколько ответов', text: 'ввод ответа', order: 'порядок' }[type] || type;
}

function renderOptions(question, qIndex) {
    if (question.type === 'order') {
        const order = state.answers[qIndex] || question.initial;
        return `<ol class="order-list">${order.map((itemIndex, position) => `
            <li class="order-item" draggable="true" data-q="${qIndex}" data-pos="${position}">
                <span class="handle">↕</span>
                <span class="marker">${position + 1}</span>
                <span>${escapeHtml(question.items[itemIndex])}</span>
            </li>
        `).join('')}</ol>`;
    }
    if (question.type === 'text') {
        const answer = state.answers[qIndex] || '';
        return `<label class="text-answer-shell">
            <input class="text-answer" type="text" data-q="${qIndex}" value="${escapeHtml(answer)}" placeholder="Введите ответ">
        </label>`;
    }
    const answer = state.answers[qIndex];
    return question.options.map((option, optionIndex) => {
        const selected = question.type === 'multiple' ? Array.isArray(answer) && answer.includes(optionIndex) : answer === optionIndex;
        const marker = question.type === 'multiple' ? (selected ? '✓' : '□') : String.fromCharCode(65 + optionIndex);
        return `<div class="option ${selected ? 'selected' : ''}" data-q="${qIndex}" data-opt="${optionIndex}">
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
    const correct = state.submitted ? isCorrect(question, state.answers[index]) : null;
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
    const answered = state.answers.filter((answer, idx) => {
        const q = QUESTIONS[idx];
        if (q.type === 'multiple') return Array.isArray(answer) && answer.length > 0;
        if (q.type === 'order') return true;
        if (q.type === 'text') return String(answer || '').trim().length > 0;
        return answer !== null;
    }).length;
    const percent = Math.round((answered / QUESTIONS.length) * 100);
    const result = state.submitted ? Math.round((state.score / QUESTIONS.length) * 100) : null;
    document.getElementById('app').innerHTML = `<div class="container">
        <div class="card hero">
            <h1>Тест по управлению IT-проектами</h1>
            <p>Отвечайте на вопросы по материалам экзаменационного списка. В заданиях с несколькими ответами засчитывается только полный набор правильных вариантов, а текстовые ответы проверяются без учета регистра и лишних знаков.</p>
            <div class="stats-grid">
                <div class="stat"><span>Вопросов</span><strong>${QUESTIONS.length}</strong></div>
                <div class="stat"><span>Отвечено</span><strong>${answered}</strong></div>
                <div class="stat"><span>Типы</span><strong>${META.types.single || 0}/${META.types.multiple || 0}/${META.types.text || 0}/${META.types.order || 0}</strong></div>
                <div class="stat"><span>Результат</span><strong>${state.submitted ? result + '%' : '—'}</strong></div>
            </div>
            <div class="progress-line"><div class="progress-fill" style="width:${percent}%"></div></div>
            <div class="toolbar">
                <button class="btn" id="submitQuiz">Завершить тест</button>
                <button class="btn-secondary btn" id="resetQuiz">Сбросить ответы</button>
                <button class="btn-outline btn" id="scrollFirst">К первому вопросу</button>
            </div>
        </div>
        ${QUESTIONS.map(renderQuestion).join('')}
        ${state.submitted ? `<div class="card result-panel"><strong>Итог:</strong> ${state.score} из ${QUESTIONS.length} (${result}%).</div>` : ''}
    </div>`;
    attachHandlers();
}

function attachHandlers() {
    document.querySelectorAll('.option').forEach(option => {
        option.addEventListener('click', () => {
            const qIndex = Number(option.dataset.q);
            const optionIndex = Number(option.dataset.opt);
            const question = QUESTIONS[qIndex];
            state.submitted = false;
            if (question.type === 'multiple') {
                const current = [...state.answers[qIndex]];
                state.answers[qIndex] = current.includes(optionIndex) ? current.filter(i => i !== optionIndex) : [...current, optionIndex];
            } else {
                state.answers[qIndex] = optionIndex;
            }
            saveState();
            render();
        });
    });

    document.querySelectorAll('.text-answer').forEach(input => {
        input.addEventListener('input', () => {
            const qIndex = Number(input.dataset.q);
            state.answers[qIndex] = input.value;
            state.submitted = false;
            saveState();
        });
    });

    let dragged = null;
    document.querySelectorAll('.order-item').forEach(item => {
        item.addEventListener('dragstart', event => {
            dragged = { qIndex: Number(item.dataset.q), position: Number(item.dataset.pos) };
            event.dataTransfer.setData('text/plain', `${dragged.qIndex}:${dragged.position}`);
        });
        item.addEventListener('dragover', event => event.preventDefault());
        item.addEventListener('drop', event => {
            event.preventDefault();
            const target = { qIndex: Number(item.dataset.q), position: Number(item.dataset.pos) };
            if (!dragged || dragged.qIndex !== target.qIndex || dragged.position === target.position) return;
            const order = [...state.answers[target.qIndex]];
            const [moved] = order.splice(dragged.position, 1);
            order.splice(target.position, 0, moved);
            state.answers[target.qIndex] = order;
            state.submitted = false;
            saveState();
            render();
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
        state = { answers: createInitialAnswers(), submitted: false, score: 0 };
        saveState();
        render();
    });
    document.getElementById('scrollFirst')?.addEventListener('click', () => {
        document.getElementById('q-0')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
