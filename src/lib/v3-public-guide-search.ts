export type GuideSearchQuestion = {
  question: string;
  searchText?: string;
};

export type GuideSearchSection<TQuestion extends GuideSearchQuestion = GuideSearchQuestion> = {
  title: string;
  description?: string;
  questions: readonly TQuestion[];
};

type GuideQuestionFor<TSection extends GuideSearchSection> = TSection["questions"][number];

type FilteredGuideSection<TSection extends GuideSearchSection> = Omit<TSection, "questions"> & {
  questions: GuideQuestionFor<TSection>[];
};

function normalise(value: string) {
  return value.trim().toLocaleLowerCase();
}

/**
 * Pure P37 Guide search. Search only narrows help content; it never decides
 * workflow state, permissions, availability or contest/publication truth.
 */
export function filterGuideSections<TSection extends GuideSearchSection>(
  sections: readonly TSection[],
  rawQuery: string,
): Array<FilteredGuideSection<TSection>> {
  const query = normalise(rawQuery);

  if (!query) {
    return sections.map((section) => ({
      ...section,
      questions: [...section.questions],
    }));
  }

  return sections.flatMap((section) => {
    const sectionMatches = normalise(`${section.title} ${section.description ?? ""}`).includes(query);
    if (sectionMatches) {
      return [{ ...section, questions: [...section.questions] }];
    }

    const questions = section.questions.filter((question) =>
      normalise(`${question.question} ${question.searchText ?? ""}`).includes(query),
    );

    if (!questions.length) return [];
    return [{ ...section, questions }];
  });
}
