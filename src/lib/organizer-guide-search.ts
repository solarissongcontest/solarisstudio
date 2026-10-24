type GuideQuestionLike = {
  question: string;
};

type GuideSectionLike<TQuestion extends GuideQuestionLike> = {
  title: string;
  description?: string;
  questions: readonly TQuestion[];
};

export function filterOrganizerGuideSections<
  TQuestion extends GuideQuestionLike,
  TSection extends GuideSectionLike<TQuestion>,
>(sections: readonly TSection[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...sections];

  return sections
    .map((section) => {
      const sectionMatches = [section.title, section.description ?? ""].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery),
      );

      return {
        ...section,
        questions: sectionMatches
          ? [...section.questions]
          : section.questions.filter((item) =>
              item.question.toLocaleLowerCase().includes(normalizedQuery),
            ),
      };
    })
    .filter((section) => section.questions.length > 0);
}

export function countOrganizerGuideAnswers(
  sections: readonly { questions: readonly unknown[] }[],
) {
  return sections.reduce((total, section) => total + section.questions.length, 0);
}
