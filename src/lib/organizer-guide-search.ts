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
>(sections: readonly TSection[], query: string): Array<Omit<TSection, "questions"> & { questions: TQuestion[] }> {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return sections
    .map((section) => {
      const sectionMatches = [section.title, section.description ?? ""].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery),
      );
      const questions = !normalizedQuery || sectionMatches
        ? [...section.questions]
        : section.questions.filter((item) =>
            item.question.toLocaleLowerCase().includes(normalizedQuery),
          );

      return {
        ...section,
        questions,
      };
    })
    .filter((section) => section.questions.length > 0);
}

export function countOrganizerGuideAnswers(
  sections: readonly { questions: readonly unknown[] }[],
) {
  return sections.reduce((total, section) => total + section.questions.length, 0);
}
